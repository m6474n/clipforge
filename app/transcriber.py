"""Local transcription with faster-whisper (word-level timestamps).

Each request can pick its compute device (``auto``/``cuda``/``cpu``). Models are
heavy (~1.5 GB for 'medium'), so we load one lazily per device and cache it for
reuse. ``auto`` prefers CUDA (float16) and falls back to CPU (int8); an explicit
``cuda`` request fails with a clear message if the GPU cannot be initialised.
No audio or text ever leaves the machine.
"""

from __future__ import annotations

import glob
import json
import logging
import os
import sys
import threading
from pathlib import Path
from typing import Callable, Optional

logger = logging.getLogger(__name__)


def _add_cuda_dll_directories() -> None:
    """Make pip-installed NVIDIA CUDA libraries discoverable on Windows.

    ctranslate2 (faster-whisper's backend) loads cuBLAS/cuDNN lazily at compute
    time. The ``nvidia-*-cu12`` wheels drop those DLLs under
    ``site-packages/nvidia/**/bin``, which Windows does NOT search by default -
    so without this the GPU path fails with "cublas64_12.dll is not found".
    No-op on non-Windows (there the loader uses RPATH/LD_LIBRARY_PATH).
    """
    if os.name != "nt":
        return
    for entry in sys.path:
        nvidia_root = os.path.join(entry, "nvidia")
        if not os.path.isdir(nvidia_root):
            continue
        for bin_dir in glob.glob(os.path.join(nvidia_root, "*", "bin")):
            # add_dll_directory helps DLLs loaded with the user-dirs flag, but
            # ctranslate2's native dependency load uses the standard search
            # order - which consults PATH, not these added dirs. So do BOTH.
            try:
                os.add_dll_directory(bin_dir)
            except OSError:
                pass
            if bin_dir not in os.environ.get("PATH", ""):
                os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")


# Must run before faster_whisper/ctranslate2 try to load the CUDA DLLs.
_add_cuda_dll_directories()

# PyAV 14+ removed 'metadata_errors' parameter from av.open(), which faster-whisper 1.x passes.
try:
    import av

    _orig_av_open = av.open

    def _compat_av_open(*args, **kwargs):
        kwargs.pop("metadata_errors", None)
        return _orig_av_open(*args, **kwargs)

    av.open = _compat_av_open
except Exception as _exc:
    logger.debug("Could not patch av.open for faster-whisper compatibility: %s", _exc)

from faster_whisper import WhisperModel  # noqa: E402

from .models import TranscriptionError  # noqa: E402
from .paths import CONFIG_FILE, TRANSCRIPTS_DIR  # noqa: E402

# Fallback when hardware can't be probed at all. Per-device auto-selection
# (see _pick_model_size) normally overrides this — kept only as a last resort.
MODEL_SIZE = "medium"

# Per-device compute precision. float16 on the GPU, int8 on the CPU.
_COMPUTE_TYPE = {"cuda": "float16", "cpu": "int8"}

# One cached model per device ('cuda' / 'cpu') so switching devices between
# requests is cheap after the first load. `_device` records the most recently
# used device (drives the /health badge); `_cuda_available` is a cached probe.
_models: dict[str, WhisperModel] = {}
_model_sizes: dict[str, str] = {}  # device -> whisper model size actually loaded
_device: str = "uninitialised"
_cuda_available: Optional[bool] = None

# Cached human-readable GPU name (e.g. "NVIDIA GeForce RTX 5060 Ti"). `_probed`
# guards the one-time lookup so a missing/None name isn't re-queried every call.
_gpu_name: Optional[str] = None
_gpu_name_probed: bool = False

# Serialises model loads so two requests warming the same device don't double-load.
_load_lock = threading.Lock()
# Serialises actual transcription passes — one GPU pass at a time. Concurrent passes
# on the single model thrash each other and look "stuck at 0%"; this queues them.
_transcribe_lock = threading.Lock()


def cuda_available() -> bool:
    """Best-effort, cached check for a usable CUDA GPU.

    Uses ctranslate2's device count (faster-whisper's backend) so the UI can
    offer/hide the GPU option without paying the cost of a full model load.
    """
    global _cuda_available
    if _cuda_available is None:
        try:
            from ctranslate2 import get_cuda_device_count

            _cuda_available = get_cuda_device_count() > 0
        except Exception:  # noqa: BLE001 - any failure means "no usable GPU"
            _cuda_available = False
    return _cuda_available


def available_devices() -> list[str]:
    """Devices the UI may offer, best (GPU) first."""
    return (["cuda", "cpu"] if cuda_available() else ["cpu"])


def gpu_name() -> Optional[str]:
    """Best-effort, cached human-readable name of the active CUDA GPU.

    Returns the marketing name (e.g. "NVIDIA GeForce RTX 5060 Ti") so the UI can
    auto-detect and show the real device instead of a generic "GPU" label, or
    ``None`` when there's no usable GPU / the name can't be read. Uses
    ``nvidia-smi`` (shipped with every NVIDIA driver) rather than pulling in a
    heavy dep like torch just to read a string. Probed once, then cached.
    """
    global _gpu_name, _gpu_name_probed
    if _gpu_name_probed:
        return _gpu_name
    _gpu_name_probed = True
    if not cuda_available():
        return None
    try:
        import subprocess

        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            timeout=5,
            # Avoid a flashing console window on Windows (no-op elsewhere).
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if out.returncode == 0:
            lines = [ln.strip() for ln in out.stdout.splitlines() if ln.strip()]
            if lines:
                _gpu_name = lines[0]
    except Exception as exc:  # noqa: BLE001 - any failure -> unnamed GPU
        logger.debug("Could not read GPU name via nvidia-smi: %s", exc)
    return _gpu_name


def _gpu_vram_gb() -> Optional[float]:
    """Best-effort total VRAM of the active CUDA GPU, in GB. None if unknown."""
    if not cuda_available():
        return None
    try:
        import subprocess

        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=5,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if out.returncode == 0:
            lines = [ln.strip() for ln in out.stdout.splitlines() if ln.strip()]
            if lines:
                return float(lines[0]) / 1024.0  # MiB -> GiB
    except Exception as exc:  # noqa: BLE001 - any failure -> unknown VRAM
        logger.debug("Could not read GPU VRAM via nvidia-smi: %s", exc)
    return None


def _system_ram_gb() -> Optional[float]:
    """Best-effort total system RAM, in GB. None if unknown.

    No new dependency (e.g. psutil) needed: ``GlobalMemoryStatusEx`` on
    Windows, ``sysconf`` on POSIX (Linux and macOS both support it) covers
    every platform this app packages for.
    """
    try:
        if os.name == "nt":
            import ctypes

            class _MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong),
                    ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]

            stat = _MEMORYSTATUSEX()
            stat.dwLength = ctypes.sizeof(_MEMORYSTATUSEX)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
            return stat.ullTotalPhys / (1024**3)
        return (os.sysconf("SC_PHYS_PAGES") * os.sysconf("SC_PAGE_SIZE")) / (1024**3)
    except Exception as exc:  # noqa: BLE001 - any failure -> unknown RAM
        logger.debug("Could not read system RAM: %s", exc)
        return None


# Models available for selection in the onboarding & settings UI
AVAILABLE_MODELS: list[dict] = [
    {
        "id": "large-v3-turbo",
        "name": "Large-v3-Turbo",
        "tagline": "Best Accuracy & Speed",
        "badge": "Recommended",
        "size_mb": 1600,
        "size_label": "~1.6 GB",
        "accuracy": "Best (99% of Large-v3)",
        "speed": "Fast on CPU & GPU",
        "description": "State-of-the-art speech recognition with 4 decoder layers. Delivers the near-identical accuracy of Large-v3 at ~6x speed on CPU. Highly recommended for accurate sentence boundaries and punchy word timestamps.",
    },
    {
        "id": "large-v3",
        "name": "Large-v3",
        "tagline": "Maximum Precision",
        "badge": "Highest Accuracy",
        "size_mb": 3100,
        "size_label": "~3.1 GB",
        "accuracy": "Maximum (100%)",
        "speed": "Slow on CPU",
        "description": "OpenAI's flagship 32-layer Whisper model. Unmatched accuracy for thick accents, background chatter, and multi-language technical terms. Note: Processing long videos on CPU takes substantial time.",
    },
    {
        "id": "medium",
        "name": "Medium",
        "tagline": "High Quality",
        "badge": "Standard",
        "size_mb": 1500,
        "size_label": "~1.5 GB",
        "accuracy": "High (92%)",
        "speed": "Moderate",
        "description": "Standard 12-layer model. High-accuracy transcription, though Large-v3-Turbo is generally faster with slightly better recognition quality.",
    },
    {
        "id": "small",
        "name": "Small",
        "tagline": "Lightweight & Fast",
        "badge": "Lightweight",
        "size_mb": 484,
        "size_label": "~484 MB",
        "accuracy": "Good (82%)",
        "speed": "Very Fast",
        "description": "Compact footprint with fast transcription on CPU. Ideal for clear dialogue, podcasts, or lower memory systems, but may miss rapid speech or subtle background words.",
    },
    {
        "id": "base",
        "name": "Base",
        "tagline": "Minimal Resource",
        "badge": "Fastest",
        "size_mb": 145,
        "size_label": "~145 MB",
        "accuracy": "Basic (70%)",
        "speed": "Ultra Fast",
        "description": "Ultra-lightweight with rapid downloads and lowest CPU usage. Best for testing and low-power hardware, with basic accuracy.",
    },
]


def get_saved_model() -> Optional[str]:
    """Return the model size configured by the user, if any."""
    if env_model := os.environ.get("WHISPER_MODEL"):
        return env_model.strip()
    if CONFIG_FILE.is_file():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("model_size")
        except Exception as exc:
            logger.debug("Could not read config file: %s", exc)
    return None


def save_selected_model(model_name: str) -> None:
    """Save the chosen model to the local config file."""
    data = {}
    if CONFIG_FILE.is_file():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {}
    data["model_size"] = model_name
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as exc:
        logger.warning("Could not save model to %s: %s", CONFIG_FILE, exc)


def is_configured() -> bool:
    """True if user has chosen/confirmed a model."""
    return get_saved_model() is not None


def get_system_specs() -> dict:
    """Detect local CPU, RAM, and GPU to provide smart model recommendation."""
    ram_gb = _system_ram_gb()
    cuda = cuda_available()
    gpu = gpu_name()

    cpu_name = "CPU"
    try:
        import platform, subprocess
        if platform.system() == "Darwin":
            res = subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"], text=True).strip()
            if res:
                cpu_name = res
        elif platform.system() == "Linux":
            with open("/proc/cpuinfo") as f:
                for line in f:
                    if "model name" in line:
                        cpu_name = line.split(":", 1)[1].strip()
                        break
        elif platform.system() == "Windows":
            cpu_name = platform.processor() or "CPU"
    except Exception:
        cpu_name = "CPU"

    # Suggestion rule based on hardware capabilities
    if cuda and _gpu_vram_gb() and _gpu_vram_gb() >= 10.0:
        suggested = "large-v3-turbo"
        reason = f"Detected NVIDIA GPU ({gpu or 'CUDA'}) with ample VRAM. Large-v3-Turbo provides top-tier clipping accuracy with blistering speed."
    elif ram_gb and ram_gb >= 12.0:
        suggested = "large-v3-turbo"
        reason = f"Detected {ram_gb:.1f} GB RAM on {cpu_name}. Large-v3-Turbo is recommended for maximum clipping accuracy and runs ~6x faster than Large-v3 on CPU."
    elif ram_gb and ram_gb >= 8.0:
        suggested = "small"
        reason = f"Detected {ram_gb:.1f} GB RAM. Small is recommended for a balanced CPU speed and memory usage."
    else:
        suggested = "base"
        reason = "Detected compact RAM footprint. Base is recommended to avoid out-of-memory issues."

    return {
        "os": sys.platform,
        "cpu": cpu_name,
        "ram_gb": round(ram_gb, 1) if ram_gb else None,
        "cuda_available": cuda,
        "gpu_name": gpu,
        "suggested_model": suggested,
        "reason": reason,
    }


def _pick_model_size(device: str) -> str:
    """Auto-select a whisper model size that fits this machine or user setting."""
    saved = get_saved_model()
    if saved:
        return saved
    specs = get_system_specs()
    return specs.get("suggested_model", "large-v3-turbo")


def get_model_size(device: Optional[str] = None) -> str:
    """The whisper model size loaded (or that WOULD be picked) for a device."""
    dev = device or (_device if _device != "uninitialised" else ("cuda" if cuda_available() else "cpu"))
    return _model_sizes.get(dev) or _pick_model_size(dev)


def is_loaded(device: str) -> bool:
    """True if a model for this concrete device is already cached (warm)."""
    return device in _models


_status_lock = threading.Lock()
_load_status: dict = {"status": "idle", "message": "", "progress": None, "model_size": None, "device": None}

_MODEL_BYTES_EST = {
    "tiny": 75_000_000,
    "base": 145_000_000,
    "small": 484_000_000,
    "medium": 1_500_000_000,
    "large-v3": 3_100_000_000,
    "large-v3-turbo": 1_600_000_000,
    "turbo": 1_600_000_000,
}


def _set_status(**kwargs) -> None:
    with _status_lock:
        _load_status.update(kwargs)


def model_status() -> dict:
    """Snapshot of the background model load — polled by /api/model-status."""
    with _status_lock:
        return dict(_load_status)


def _poll_download_progress(size: str, stop_event: threading.Event) -> None:
    """Watch HuggingFace's partial-download file(s) and update progress."""
    total = _MODEL_BYTES_EST.get(size, 1_600_000_000)
    try:
        from huggingface_hub.constants import HF_HUB_CACHE
    except ImportError:
        return
    patterns = [
        os.path.join(HF_HUB_CACHE, f"models--*--faster-whisper-{size}", "blobs", "*.incomplete"),
        os.path.join(HF_HUB_CACHE, f"models--*--*{size}*", "blobs", "*.incomplete"),
    ]
    while not stop_event.is_set():
        try:
            got = 0
            for pat in patterns:
                files = glob.glob(pat)
                if files:
                    got = sum(os.path.getsize(p) for p in files)
                    break
            if got > 0:
                frac = max(0.0, min(0.99, got / total))
                _set_status(
                    status="downloading", progress=frac,
                    message=f"Downloading the '{size}' AI model (first time only)... {int(frac * 100)}%",
                )
        except OSError:
            pass
        stop_event.wait(1.0)


def switch_model(model_name: str, device: str = "auto") -> dict:
    """Switch active model and start download/warmup in the background."""
    valid_ids = [m["id"] for m in AVAILABLE_MODELS]
    if model_name not in valid_ids and model_name not in ("tiny", "turbo"):
        raise TranscriptionError(f"Unknown model '{model_name}'. Available: {valid_ids}")

    save_selected_model(model_name)
    with _load_lock:
        _models.clear()
        _model_sizes.clear()

    _set_status(status="downloading", message=f"Preparing '{model_name}' model...", progress=0.0, model_size=model_name, device=device)

    def _loader():
        try:
            load_model(device)
        except Exception as e:
            logger.exception("Failed to switch model to %s: %s", model_name, e)
            _set_status(status="error", message=str(e), model_size=model_name, device=device)

    threading.Thread(target=_loader, daemon=True).start()
    return {
        "status": "downloading",
        "model_size": model_name,
        "message": f"Switching to '{model_name}' model...",
    }


def _load_on(device: str) -> WhisperModel:
    """Load (or reuse the cached) model on a concrete device ('cuda'/'cpu')."""
    global _device
    with _load_lock:
        if device in _models:
            _device = device
            return _models[device]
        compute = _COMPUTE_TYPE[device]
        size = _pick_model_size(device)
        _model_sizes[device] = size
        _set_status(status="downloading", message=f"Preparing the '{size}' AI model...",
                    progress=0.0, model_size=size, device=device)
        logger.info("Loading whisper '%s' on %s (%s)...", size, device, compute)

        stop_event = threading.Event()
        poller = threading.Thread(target=_poll_download_progress, args=(size, stop_event), daemon=True)
        poller.start()
        try:
            model = WhisperModel(size, device=device, compute_type=compute)
        finally:
            stop_event.set()

        _models[device] = model
        _device = device
        _set_status(status="ready", message="Ready", progress=1.0, model_size=size, device=device)
        logger.info("Whisper '%s' loaded on %s.", size, device)
        return model


def load_model(device: str = "auto") -> WhisperModel:
    """Load the whisper model for the requested device, caching per device.

    Args:
        device: 'auto' (GPU if available, else CPU), 'cuda', or 'cpu'.

    'auto' tries the GPU first and falls back to the CPU. An explicit 'cuda'
    request does NOT silently fall back - it raises a clear error so the user
    knows the GPU is unusable and can pick CPU. Safe to call repeatedly.
    """
    requested = (device or "auto").lower()
    if requested == "gpu":
        requested = "cuda"

    if requested == "cuda":
        try:
            return _load_on("cuda")
        except Exception as exc:  # noqa: BLE001 - GPU absent or cuDNN mismatched
            logger.warning("CUDA load failed (%s).", exc)
            _set_status(status="error", message=str(exc))
            raise TranscriptionError(
                "Could not run on the GPU (CUDA). Check CUDA 12 + matching cuDNN, "
                f"or choose CPU instead. Details: {exc}"
            ) from exc

    if requested == "cpu":
        try:
            return _load_on("cpu")
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to load whisper on CPU.")
            _set_status(status="error", message=str(exc))
            raise TranscriptionError(
                f"Could not load the whisper model on CPU: {exc}"
            ) from exc

    # 'auto' (or anything unrecognised): prefer GPU, fall back to CPU.
    if cuda_available():
        try:
            return _load_on("cuda")
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "CUDA load failed (%s). Falling back to CPU (int8). "
                "If you expected GPU, check CUDA 12 + matching cuDNN.",
                exc,
            )
    try:
        return _load_on("cpu")
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to load whisper on CPU as well.")
        _set_status(status="error", message=str(exc))
        raise TranscriptionError(
            f"Could not load the whisper model on GPU or CPU: {exc}"
        ) from exc


def get_device() -> str:
    """Return the device of the most-recent model ('cuda', 'cpu', or 'uninitialised')."""
    return _device


def _normalize_language(language: Optional[str]) -> Optional[str]:
    """Map UI language values to a Whisper code, or None for auto-detect.

    Empty string / 'auto' (case-insensitive) -> None, which tells Whisper to
    detect the spoken language itself. 'hinglish' is not a Whisper language —
    it's Hindustani transcribed as Hindi and then romanised after the fact (see
    ``transcribe_video``), so here it maps to the Hindi model code.
    """
    if not language:
        return None
    lang = language.strip().lower()
    if lang in ("", "auto"):
        return None
    if lang == "hinglish":
        return "hi"
    return lang


def transcribe_video(
    video_path: Path,
    clip_id: str,
    progress: Optional[Callable[[float, str], None]] = None,
    device: str = "auto",
    language: Optional[str] = None,
) -> dict:
    """Transcribe `video_path`, returning a dict with word-level timestamps.

    Returns a dict shaped like:
        {
          "language": "en",
          "duration": 123.4,
          "text": "full transcript ...",
          "words": [{"word": "Hello", "start": 0.0, "end": 0.4}, ...],
          "segments": [{"id": 0, "start": 0.0, "end": 3.2, "text": "..."}, ...],
        }

    The result is also saved to transcripts/<clip_id>.json.

    Raises:
        TranscriptionError: on any failure.
    """
    model = load_model(device)

    # One transcription at a time. If another is running, surface a clear "waiting"
    # message so the UI shows a queued state instead of a frozen 0%.
    if progress and _transcribe_lock.locked():
        progress(0.0, "Waiting for an earlier transcription to finish…")
    _transcribe_lock.acquire()
    try:
        segments_gen, info = model.transcribe(
            str(video_path),
            word_timestamps=True,
            vad_filter=True,  # trims long silences -> better segment boundaries
            language=_normalize_language(language),  # None -> auto-detect
        )

        segments: list[dict] = []
        words: list[dict] = []
        text_parts: list[str] = []

        total_dur = float(info.duration) or 0.0
        if progress:
            progress(0.01, "Transcribing audio with local Whisper...")

        # IMPORTANT: `segments_gen` is a lazy generator. We must iterate it fully
        # to actually run transcription and collect every word. Each yielded
        # segment lets us report progress as seg.end / total_duration.
        for seg in segments_gen:
            seg_text = (seg.text or "").strip()
            if progress and total_dur > 0:
                frac = min(0.99, float(seg.end) / total_dur)
                progress(frac, f"Transcribing... {int(frac * 100)}%")
            segments.append(
                {
                    "id": seg.id,
                    "start": float(seg.start),
                    "end": float(seg.end),
                    "text": seg_text,
                }
            )
            text_parts.append(seg_text)

            for w in (seg.words or []):
                token = (w.word or "").strip()
                if not token:
                    continue
                words.append(
                    {
                        "word": token,
                        "start": float(w.start),
                        "end": float(w.end),
                    }
                )

        result = {
            "language": info.language,
            "duration": float(info.duration),
            "text": " ".join(text_parts).strip(),
            "words": words,
            "segments": segments,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("Transcription failed for %s", video_path)
        raise TranscriptionError(f"Transcription failed: {exc}") from exc
    finally:
        _transcribe_lock.release()

    # Hinglish: the audio was transcribed as Hindi (Devanagari); romanise the
    # whole transcript to readable Roman Urdu/Hindi before caching/persisting.
    if (language or "").strip().lower() == "hinglish":
        from . import translit

        result = translit.romanize_transcript(result)

    # Persist the transcript for debugging / reuse.
    transcript_path = TRANSCRIPTS_DIR / f"{clip_id}.json"
    try:
        transcript_path.write_text(
            json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    except OSError as exc:
        logger.warning("Could not write transcript json: %s", exc)

    return result
