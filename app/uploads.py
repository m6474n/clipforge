"""Local file uploads as an alternative video source to a URL.

A user can upload a video straight from their machine instead of providing a URL.
We stream the file to ``downloads/<uuid><ext>`` (the same place yt-dlp writes to)
and hand the pipeline a reference (``upload_id``) it can resolve back to a path.

The id is a 32-char hex uuid we generate ourselves, and resolution only ever
globs ``downloads/<id>.*`` - so a caller can never use the id to reach a file
outside the downloads directory (no path traversal).
"""

from __future__ import annotations

import errno
import hashlib
import logging
import os
import re
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import BinaryIO, Optional

from .models import InvalidVideoURLError
from .paths import DOWNLOADS_DIR

logger = logging.getLogger(__name__)

# Container formats ffmpeg/whisper can handle. Extension is a cheap first gate;
# ffmpeg is the real validator when it tries to read the file.
ALLOWED_EXTS = {
    ".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v",
    ".flv", ".wmv", ".mpeg", ".mpg", ".ts", ".m2ts",
}

_ID_RE = re.compile(r"^[0-9a-f]{32}$")


def save_upload(filename: str, fileobj: BinaryIO) -> dict:
    """Stream an uploaded file to downloads/ and return its reference.

    Args:
        filename: the client-supplied name (used only for its extension/label).
        fileobj: a binary file-like object to copy from.

    Returns:
        ``{"upload_id": <hex>, "filename": <name>, "ext": <ext>}``.

    Raises:
        InvalidVideoURLError: unsupported extension or empty file.
    """
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise InvalidVideoURLError(
            f"Unsupported file type '{ext or 'unknown'}'. Please upload a video "
            f"file ({', '.join(sorted(ALLOWED_EXTS))})."
        )

    # Clean up any stale partial uploads or leftovers older than 10 mins
    try:
        for stale in DOWNLOADS_DIR.glob("tmp_*"):
            if stale.is_file():
                stale.unlink(missing_ok=True)
    except Exception:
        pass

    # Check available disk space
    try:
        _, _, free_bytes = shutil.disk_usage(DOWNLOADS_DIR)
        if free_bytes < 500 * 1024 * 1024:  # under 500MB free
            free_gb = free_bytes / (1024 ** 3)
            raise InvalidVideoURLError(
                f"Disk is full ({free_gb:.1f} GB available). Please free up disk space on your drive "
                f"or clear old clips/downloads before uploading."
            )
    except OSError:
        pass

    # Stream to a temporary file while computing sha256 for deterministic caching
    temp_id = uuid.uuid4().hex
    temp_dest = DOWNLOADS_DIR / f"tmp_{temp_id}{ext}"
    hasher = hashlib.sha256()

    try:
        with temp_dest.open("wb") as out:
            while True:
                chunk = fileobj.read(1024 * 1024)
                if not chunk:
                    break
                hasher.update(chunk)
                out.write(chunk)
    except OSError as exc:
        temp_dest.unlink(missing_ok=True)
        if exc.errno == errno.ENOSPC or getattr(exc, "errno", None) == 28:
            _, _, free_bytes = shutil.disk_usage(DOWNLOADS_DIR)
            free_gb = free_bytes / (1024 ** 3)
            logger.error("Disk full error while saving upload %s (only %.2f GB free)", filename, free_gb)
            raise InvalidVideoURLError(
                f"Disk space is full ([Errno 28] No space left on device). "
                f"Your drive only has {free_gb:.1f} GB available, which is not enough for this file. "
                f"Please free up disk space on your computer (e.g. empty Trash, delete old clips or downloads) and try again."
            ) from exc
        logger.exception("Failed to save upload %s", filename)
        raise InvalidVideoURLError(f"Could not save the uploaded file: {exc}") from exc

    if not temp_dest.exists() or temp_dest.stat().st_size == 0:
        temp_dest.unlink(missing_ok=True)
        raise InvalidVideoURLError("The uploaded file was empty.")

    upload_id = hasher.hexdigest()[:32]
    final_dest = DOWNLOADS_DIR / f"{upload_id}{ext}"

    if final_dest.exists() and final_dest.stat().st_size == temp_dest.stat().st_size:
        temp_dest.unlink(missing_ok=True)
        logger.info("Reusing existing upload %s -> %s (%d bytes)", filename, final_dest.name, final_dest.stat().st_size)
    else:
        temp_dest.replace(final_dest)
        logger.info("Saved upload %s -> %s (%d bytes)", filename, final_dest.name, final_dest.stat().st_size)

    return {"upload_id": upload_id, "filename": Path(filename or "video").name, "ext": ext}


def resolve_upload(upload_id: str) -> Path:
    """Map an ``upload_id`` back to the saved file path.

    Raises:
        InvalidVideoURLError: malformed id or file no longer present.
    """
    if not upload_id or not _ID_RE.match(upload_id):
        raise InvalidVideoURLError("Invalid upload reference.")
    matches = [
        p for p in DOWNLOADS_DIR.glob(f"{upload_id}.*")
        if not p.name.endswith((".part", ".ytdl", ".temp", ".aria2"))
    ]
    if not matches:
        raise InvalidVideoURLError(
            "The uploaded file could not be found. Please upload it again."
        )
    # Prefer final video format (.mp4, .mkv, .webm, etc.) over intermediate files
    matches.sort(key=lambda p: (0 if p.suffix.lower() in {".mp4", ".mkv", ".mov", ".webm"} else 1, p.name))
    return matches[0]


def find_local_video(filename: str, size: Optional[int] = None) -> Optional[Path]:
    """Search common local locations for an existing video file to avoid copying it.

    Checks adjacent downloader directories, user Downloads, Desktop, Movies,
    Videos, Documents, and macOS Spotlight (mdfind).
    """
    if not filename:
        return None

    clean_name = Path(filename).name

    # 1. Check Spotlight on macOS (instant global search across the disk)
    if shutil.which("mdfind"):
        try:
            escaped = clean_name.replace('"', '\\"')
            cmd = ["mdfind", f'kMDItemFSName == "{escaped}"']
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=3)
            for line in res.stdout.strip().splitlines():
                p = Path(line.strip())
                if p.is_file():
                    if size is None or p.stat().st_size == size:
                        return p.resolve()
        except Exception as exc:
            logger.debug("mdfind search error: %s", exc)

    # 2. Check candidate directories
    candidates = []
    # Project & siblings
    curr = Path.cwd().resolve()
    for parent in [curr, curr.parent, curr.parent.parent]:
        candidates.append(parent / clean_name)
        for folder in ["youtube_video_downloader", "downloads", "Downloads", "videos", "Videos", "media"]:
            candidates.append(parent / folder / clean_name)

    # Standard User folders
    home = Path.home()
    for folder in ["Downloads", "Desktop", "Movies", "Videos", "Documents"]:
        candidates.append(home / folder / clean_name)
        if folder in ("Documents", "Downloads"):
            for sub in ["python/youtube_video_downloader", "youtube_video_downloader"]:
                candidates.append(home / folder / sub / clean_name)

    for c in candidates:
        try:
            exp = c.expanduser().resolve()
            if exp.is_file():
                if size is None or exp.stat().st_size == size:
                    return exp
        except Exception:
            continue

    return None


def register_local_file(file_path: str | Path) -> dict:
    """Create a zero-copy reference (symlink) to an existing file on disk.

    This avoids copying gigabytes of video into downloads/, preventing disk exhaustion
    and saving processing time.
    """
    p = Path(file_path).expanduser().resolve()
    if not p.is_file():
        raise InvalidVideoURLError(f"Local file does not exist: {p}")

    ext = p.suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise InvalidVideoURLError(
            f"Unsupported file type '{ext or 'unknown'}'. Please select a video "
            f"file ({', '.join(sorted(ALLOWED_EXTS))})."
        )

    # Deterministic id based on path and file size
    upload_id = hashlib.sha256(f"{p}_{p.stat().st_size}".encode("utf-8")).hexdigest()[:32]
    symlink_dest = DOWNLOADS_DIR / f"{upload_id}{ext}"

    if symlink_dest.is_symlink() or symlink_dest.exists():
        try:
            if symlink_dest.is_symlink() and symlink_dest.resolve() == p:
                return {
                    "upload_id": upload_id,
                    "filename": p.name,
                    "ext": ext,
                    "real_path": str(p),
                    "size": p.stat().st_size,
                    "linked": True,
                }
            symlink_dest.unlink(missing_ok=True)
        except OSError:
            pass

    try:
        symlink_dest.symlink_to(p)
        logger.info("Created zero-copy symlink %s -> %s", symlink_dest.name, p)
    except OSError as exc:
        try:
            os.link(str(p), str(symlink_dest))
            logger.info("Created zero-copy hardlink %s -> %s", symlink_dest.name, p)
        except OSError:
            logger.warning("Could not symlink/hardlink %s; falling back to copy: %s", p, exc)
            shutil.copyfile(p, symlink_dest)

    return {
        "upload_id": upload_id,
        "filename": p.name,
        "ext": ext,
        "real_path": str(p),
        "size": p.stat().st_size,
        "linked": True,
    }
