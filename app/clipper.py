"""Cut, reframe, and burn captions with ffmpeg.

Each clip is re-encoded (libx264 + aac) so cuts are frame-accurate and the ASS
captions are burned into the pixels.

``crop`` scales to *cover* the chosen aspect ratio (9:16 / 16:9) and center-crops
to fill it. ``square`` renders a 9:16 canvas with the source cropped to a 1:1
square, given **soft rounded corners**, and centered on black — with an optional
title drawn above it (the "rounded square reel" look). The aspect ratio is
ignored in square mode (the canvas is always 9:16).
"""

from __future__ import annotations

import logging
import os
import subprocess
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

from . import effects
from .models import AspectRatio, ClipGenerationError, FitMode
from .paths import CLIPS_DIR, FONTS_DIR, MASKS_DIR

logger = logging.getLogger(__name__)

# Target frame sizes per aspect ratio.
_TARGETS = {
    AspectRatio.NINE_16: (1080, 1920),
    AspectRatio.SIXTEEN_9: (1920, 1080),
}

# Square ("rounded reel") mode: a 9:16 canvas with a centered, rounded 1:1 square.
_SQUARE_CANVAS = (1080, 1920)   # output frame (aspect ratio is ignored)
_SQUARE_INNER = 1020            # side of the centered square
_SQUARE_RADIUS = 60             # corner radius of that square (soft, anti-aliased)


def target_size(aspect_ratio: AspectRatio, fit_mode: FitMode) -> tuple[int, int]:
    """Output (width, height): 9:16 canvas for square mode, else the aspect size."""
    if fit_mode == FitMode.SQUARE:
        return _SQUARE_CANVAS
    return _TARGETS[aspect_ratio]


def get_video_duration(video_path: Path) -> float:
    """Read media duration in seconds via ffmpeg without full decode."""
    try:
        cmd = ["ffmpeg", "-i", str(video_path)]
        res = subprocess.run(cmd, capture_output=True, text=True, errors="ignore")
        m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", res.stderr)
        if m:
            h, mm, s = m.groups()
            return max(0.1, int(h) * 3600 + int(mm) * 60 + float(s))
    except Exception as exc:
        logger.warning("Could not probe video duration via ffmpeg: %s", exc)
    return 60.0


def ensure_rounded_mask(size: int = _SQUARE_INNER, radius: int = _SQUARE_RADIUS) -> Path:
    """Create (once) and cache a grayscale rounded-rectangle mask via ffmpeg.

    White inside the rounded square, black outside; used by ``alphamerge`` to
    give the centered square its soft corners. Generated with ffmpeg's ``geq``
    so we need no extra image library.
    """
    path = MASKS_DIR / f"rounded_{size}_{radius}.png"
    if path.exists():
        return path
    MASKS_DIR.mkdir(parents=True, exist_ok=True)

    if radius <= 0:
        # Sharp corners: a fully opaque square needs no SDF ramp — solid white.
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c=white:s={size}x{size}:d=0.1",
            "-frames:v", "1", str(path),
        ]
    else:
        edge = size - 1 - radius
        # Distance from each pixel to the inner rectangle's edge (the rounded-rect SDF);
        # a ~1.5px soft ramp around `radius` anti-aliases the corners (smooth, not jaggy).
        # alpha = 255 inside, 0 outside. Commas are escaped for the filtergraph.
        expr = (
            f"255*clip(0.5+({radius}-hypot("
            f"max(0\\,{radius}-X)+max(0\\,X-{edge})\\,"
            f"max(0\\,{radius}-Y)+max(0\\,Y-{edge})))/1.5\\,0\\,1)"
        )
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c=black:s={size}x{size}:d=0.1",
            "-vf", f"geq=lum='{expr}':cb=128:cr=128",
            "-frames:v", "1", str(path),
        ]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              text=True, encoding="utf-8", errors="replace")
    except FileNotFoundError as exc:
        raise ClipGenerationError(
            "ffmpeg was not found on PATH (needed to build the rounded mask)."
        ) from exc
    if proc.returncode != 0 or not path.exists():
        tail = (proc.stderr or "").strip().splitlines()[-8:]
        raise ClipGenerationError(
            "Could not generate the rounded-corner mask:\n" + "\n".join(tail)
        )
    return path

_BAR_FONT = FONTS_DIR / "Roboto-Bold.ttf"


@dataclass
class ClipOptions:
    """Everything generate_clip needs beyond the time range."""

    aspect_ratio: AspectRatio
    fit_mode: FitMode
    ass_path: Path
    clip_id: str
    index: int
    square_corners: str = "round"      # "round" | "square" — square fit mode only
    bar_text: Optional[str] = None
    bar_text_color: str = "#FFFFFF"     # square title colour
    bar_text_anim: str = "none"         # square title entrance: none | fade | slide
    cinematic: Optional[dict] = None  # cinematic effects config (see app.effects)
    music_path: Optional[Path] = None  # background-music track to mix under the audio
    music_volume: float = 35.0         # 0-100, reels-style (ducked under speech)
    music_duck: float = 70.0           # 0-100, how hard music dips under the voice
    music_start: float = 0.0           # seconds into the track to start from (beat-aligned)
    signature: Optional[dict] = None   # burned-in watermark (see app.models.Signature)
    reframe: Optional[list[dict]] = None  # manual crop keyframes (see app.models.ReframeKeyframe)
    framing: Optional[dict] = None      # framing layout config (see app.models.FramingConfig)
    text_overlay: Optional[dict] = None # fixed text overlay (see app.models.TextOverlay)
    template: Optional[dict] = None     # background template (see app.models.TemplateConfig)


def _rel_for_filter(target: Path, start_dir: Path) -> str:
    """Return `target` relative to `start_dir` with forward slashes.

    ffmpeg's filtergraph parser treats ':' as an option separator and is fussy
    about Windows drive letters and spaces inside filter VALUES (the `ass`,
    `fontsdir`, and drawtext `fontfile` options). By running ffmpeg with its cwd
    set to the clip folder and passing these as *relative* paths (e.g. `0.ass`,
    `../../assets/fonts`) we avoid the drive colon and spaces entirely, so no
    fragile two-level escaping is needed. All paths live under the project root
    on the same drive, so relpath is always valid.
    """
    return os.path.relpath(str(target), str(start_dir)).replace("\\", "/")


def _escape_drawtext(text: str) -> str:
    """Escape user text for ffmpeg drawtext (the value is wrapped in quotes)."""
    return (
        text.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "’")  # swap apostrophe for a typographic one to avoid quoting hell
        .replace("%", "\\%")
    )


def _ass_filter(opts: ClipOptions, work_dir: Path) -> str:
    """The caption-burn filter. Relative paths keep the drive colon/spaces out."""
    return (
        f"ass={_rel_for_filter(opts.ass_path, work_dir)}:"
        f"fontsdir={_rel_for_filter(FONTS_DIR, work_dir)}"
    )


def _caption_stage(in_label: str, opts: ClipOptions, work_dir: Path) -> str:
    """The final stage that burns the captions onto ``in_label`` -> ``[outv]``."""
    return f"[{in_label}]{_ass_filter(opts, work_dir)}[outv]"


_has_drawtext: Optional[bool] = None


def _supports_drawtext() -> bool:
    global _has_drawtext
    if _has_drawtext is None:
        try:
            r = subprocess.run(
                ["ffmpeg", "-h", "filter=drawtext"],
                capture_output=True,
                text=True,
                timeout=2,
            )
            _has_drawtext = r.returncode == 0 and "Unknown filter" not in (r.stdout + r.stderr)
        except Exception:
            _has_drawtext = False
    return _has_drawtext


def _inject_extra_ass(opts: ClipOptions, w: int, h: int) -> None:
    """Render signature/title/text overlay via ASS when drawtext filter is absent or as fallback."""
    if not opts.ass_path or not opts.ass_path.is_file():
        return
    extra: list[str] = []
    extra_styles: list[str] = []

    # Signature / watermark fallback if drawtext unavailable
    sig = opts.signature
    if not _supports_drawtext() and sig and sig.get("enabled") and (sig.get("text") or "").strip():
        txt = sig["text"].strip().replace("\\", "").replace("\n", " ")
        px = max(0.0, min(1.0, float(sig.get("pos_x") if sig.get("pos_x") is not None else 50) / 100.0))
        py = max(0.0, min(1.0, float(sig.get("pos_y") if sig.get("pos_y") is not None else 92) / 100.0))
        scale = w / 1080.0
        size = max(10, int(round(float(sig.get("size") or 34) * scale)))
        alpha = max(0.0, min(1.0, float(sig.get("opacity") if sig.get("opacity") is not None else 75) / 100.0))
        ass_alpha = f"{int(round((1.0 - alpha) * 255)):02X}"
        c = (sig.get("color") or "#FFFFFF").lstrip("#")
        bgr = f"{c[4:6]}{c[2:4]}{c[0:2]}".upper() if len(c) == 6 else "FFFFFF"
        x = int(round(px * w))
        y = int(round(py * h))
        extra.append(
            f"Dialogue: 10,0:00:00.00,9:59:59.00,Default,,0,0,0,,{{\\an5\\pos({x},{y})\\fs{size}\\c&H{bgr}&\\alpha&H{ass_alpha}&\\bord2\\3c&H000000&\\shad1\\4c&H000000&}}{txt}"
        )

    # Template text fallback if drawtext unavailable
    tpl = opts.template
    if not _supports_drawtext() and tpl and tpl.get("preset") in ("twitter", "instagram", "news"):
        if tpl.get("preset") == "news":
            cap = (tpl.get("caption_text") or "LIVE: Special Announcement").strip().replace("\n", " ")
            extra.append(f"Dialogue: 10,0:00:00.00,9:59:59.00,Default,,0,0,0,,{{\\an1\\pos(60,{h - 120})\\fs24\\c&HFFFFFF&\\bord2\\3c&H000000&}}{cap}")
        elif tpl.get("preset") == "twitter":
            dn = (tpl.get("display_name") or "Creator").strip()
            un = (tpl.get("username") or "creator").strip()
            extra.append(f"Dialogue: 10,0:00:00.00,9:59:59.00,Default,,0,0,0,,{{\\an7\\pos(60,90)\\fs26\\c&HFFFFFF&}}{dn} @{un}")
            if tpl.get("caption_text"):
                cap = tpl["caption_text"].strip().replace("\n", " ")
                extra.append(f"Dialogue: 10,0:00:00.00,9:59:59.00,Default,,0,0,0,,{{\\an7\\pos(60,130)\\fs22\\c&HFFFFFF&}}{cap}")
        elif tpl.get("preset") == "instagram":
            un = (tpl.get("username") or "creator").strip()
            extra.append(f"Dialogue: 10,0:00:00.00,9:59:59.00,Default,,0,0,0,,{{\\an7\\pos(40,65)\\fs24\\c&HFFFFFF&}}{un}")

    # Square mode bar_text fallback if drawtext unavailable
    if not _supports_drawtext() and opts.bar_text and opts.bar_text.strip():
        lines = [ln.strip() for ln in opts.bar_text.split("\n") if ln.strip()][:3]
        font_size = max(28, int(round(h * 0.040)))
        line_h = int(round(font_size * 1.3))
        block_h = line_h * len(lines)
        s = _SQUARE_INNER
        my = (h - s) // 2
        start_y = max(16, my - block_h - 22)
        c = (opts.bar_text_color or "#FFFFFF").lstrip("#")
        bgr = f"{c[4:6]}{c[2:4]}{c[0:2]}".upper() if len(c) == 6 else "FFFFFF"
        for li, ln in enumerate(lines):
            y = start_y + li * line_h
            clean_ln = ln.replace("\\", "").replace("\n", " ")
            extra.append(
                f"Dialogue: 10,0:00:00.00,9:59:59.00,Default,,0,0,0,,{{\\an8\\pos({w // 2},{y})\\fs{font_size}\\c&H{bgr}&\\bord3\\3c&H000000&}}{clean_ln}"
            )

    if extra or extra_styles:
        try:
            content = opts.ass_path.read_text(encoding="utf-8")
            if extra_styles and "[Events]" in content:
                parts = content.split("[Events]", 1)
                content = parts[0] + "\n".join(extra_styles) + "\n\n[Events]" + parts[1]
            if extra:
                if not content.endswith("\n"):
                    content += "\n"
                content += "\n".join(extra) + "\n"
            opts.ass_path.write_text(content, encoding="utf-8")
        except OSError as exc:
            logger.warning("Could not append fallback overlays to ASS: %s", exc)


def _signature_stages(in_label: str, sig: Optional[dict], w: int, h: int, work_dir: Path) -> tuple[list[str], str]:
    """Burn the signature/watermark text. Returns (stages, out_label).

    pos_x/pos_y are the text centre as a % of the frame; size is at 1080-wide and
    scales to the real width; opacity 0-100. No-op when disabled/empty.
    """
    if not _supports_drawtext() or not sig or not sig.get("enabled") or not (sig.get("text") or "").strip():
        return [], in_label
    scale = w / 1080.0
    size = max(10, int(round(float(sig.get("size") or 34) * scale)))
    alpha = max(0.0, min(1.0, float(sig.get("opacity") if sig.get("opacity") is not None else 75) / 100.0))
    col = (sig.get("color") or "#FFFFFF").replace("#", "0x")
    px = max(0.0, min(1.0, float(sig.get("pos_x") if sig.get("pos_x") is not None else 50) / 100.0))
    py = max(0.0, min(1.0, float(sig.get("pos_y") if sig.get("pos_y") is not None else 92) / 100.0))
    txt = _escape_drawtext(sig["text"].strip())
    stage = (
        f"[{in_label}]drawtext=fontfile={_rel_for_filter(_BAR_FONT, work_dir)}:"
        f"text='{txt}':fontcolor={col}@{alpha:.3f}:fontsize={size}:"
        f"x=(w-text_w)*{px:.4f}:y=(h-text_h)*{py:.4f}:"
        f"borderw=2:bordercolor=black@{min(0.55, alpha):.3f}:shadowcolor=black@0.4:shadowx=1:shadowy=1[sig]"
    )
    return [stage], "sig"


def _find_font_file(family: str) -> Path:
    f_clean = (family or "").strip().lower()
    mapping = {
        "roboto": "Roboto-Bold.ttf",
        "roboto-bold": "Roboto-Bold.ttf",
        "roboto-regular": "Roboto-Regular.ttf",
        "montserrat": "Montserrat.ttf",
        "poppins": "Poppins-Bold.ttf",
        "poppins-bold": "Poppins-Bold.ttf",
        "bebas neue": "BebasNeue-Regular.ttf",
        "bebasneue": "BebasNeue-Regular.ttf",
        "anton": "Anton-Regular.ttf",
        "bangers": "Bangers-Regular.ttf",
        "luckiest guy": "LuckiestGuy-Regular.ttf",
        "oswald": "Oswald.ttf",
        "alfa slab one": "AlfaSlabOne-Regular.ttf",
        "permanent marker": "PermanentMarker-Regular.ttf",
        "archivo black": "ArchivoBlack-Regular.ttf",
        "dm serif display": "DMSerifDisplay-Regular.ttf",
        "teko": "Teko.ttf",
        "changa": "Changa.ttf",
        "russo one": "RussoOne-Regular.ttf",
        "titan one": "TitanOne-Regular.ttf",
        "paytone one": "PaytoneOne-Regular.ttf",
        "lilita one": "LilitaOne-Regular.ttf",
        "passion one": "PassionOne-Bold.ttf",
        "sigmar one": "SigmarOne-Regular.ttf",
        "bowlby one sc": "BowlbyOneSC-Regular.ttf",
        "concert one": "ConcertOne-Regular.ttf",
        "bungee": "Bungee-Regular.ttf",
        "shrikhand": "Shrikhand-Regular.ttf",
    }
    fname = mapping.get(f_clean)
    if fname and (FONTS_DIR / fname).exists():
        return FONTS_DIR / fname
    for candidate in FONTS_DIR.glob("*.ttf"):
        if f_clean and f_clean in candidate.stem.lower():
            return candidate
    return FONTS_DIR / "Roboto-Bold.ttf"


def _find_emoji_font() -> tuple[Optional[ImageFont.FreeTypeFont], int]:
    candidates = [
        (Path("/System/Library/Fonts/Apple Color Emoji.ttc"), 64),
        (Path("/System/Library/Fonts/Apple Color Emoji.ttf"), 64),
        (FONTS_DIR / "NotoColorEmoji.ttf", 109),
        (FONTS_DIR / "NotoEmoji.ttf", 64),
    ]
    for p, sz in candidates:
        if p.exists():
            try:
                return ImageFont.truetype(str(p), sz), sz
            except Exception:
                continue
    return None, 0


def _is_emoji(char: str) -> bool:
    cp = ord(char)
    if cp in (0x200D, 0xFE0E, 0xFE0F):
        return True
    if 0x1F600 <= cp <= 0x1F64F: return True
    if 0x1F300 <= cp <= 0x1F5FF: return True
    if 0x1F680 <= cp <= 0x1F6FF: return True
    if 0x1F700 <= cp <= 0x1FAFF: return True
    if 0x2600 <= cp <= 0x27BF: return True
    return unicodedata.category(char) in ("So", "Sk")


def _split_text_and_emojis(text: str) -> list[tuple[str, bool]]:
    runs: list[tuple[str, bool]] = []
    cur_text = ""
    cur_is_emoji: Optional[bool] = None
    for ch in text:
        e = _is_emoji(ch)
        if cur_is_emoji is None:
            cur_is_emoji = e
            cur_text = ch
        elif cur_is_emoji == e:
            cur_text += ch
        else:
            runs.append((cur_text, cur_is_emoji))
            cur_text = ch
            cur_is_emoji = e
    if cur_text:
        runs.append((cur_text, cur_is_emoji))
    return runs


def _render_text_overlay_png(
    text_overlay: dict, w: int, h: int, work_dir: Path
) -> Optional[Path]:
    text = (text_overlay.get("text") or "").strip()
    if not text:
        return None

    scale = w / 1080.0
    font_size = max(18, int(round(float(text_overlay.get("font_size") or 52) * scale)))
    pad_h = max(8, int(round(float(text_overlay.get("padding") or 16) * scale * 1.3)))
    pad_v = max(6, int(round(float(text_overlay.get("padding") or 16) * scale * 0.9)))
    border_radius = max(0, int(round(float(text_overlay.get("border_radius") or 12) * scale)))

    font_path = _find_font_file(text_overlay.get("font_family") or "Roboto")
    try:
        font = ImageFont.truetype(str(font_path), font_size)
    except Exception:
        font = ImageFont.load_default()

    emoji_font, emoji_strike = _find_emoji_font()

    lines = text.split("\n")
    line_runs = [_split_text_and_emojis(ln) for ln in lines]

    line_layouts = []
    max_line_w = 0
    line_h = int(round(font_size * 1.25))

    for runs in line_runs:
        layout_items = []
        cur_w = 0
        for run_text, is_em in runs:
            if is_em and emoji_font:
                for em in run_text:
                    if ord(em) in (0xFE0E, 0xFE0F):
                        continue
                    item_w = int(round(font_size * 1.05))
                    layout_items.append({"type": "emoji", "glyph": em, "w": item_w, "h": font_size, "x": cur_w})
                    cur_w += item_w
            else:
                w_px = int(round(font.getlength(run_text)))
                layout_items.append({"type": "text", "text": run_text, "w": w_px, "h": font_size, "x": cur_w})
                cur_w += w_px
        line_layouts.append((cur_w, layout_items))
        if cur_w > max_line_w:
            max_line_w = cur_w

    banner_w = max_line_w + pad_h * 2
    banner_h = len(lines) * line_h + pad_v * 2

    # Constrain to 94% of frame width if excessive
    max_allowed_w = int(round(w * 0.94))
    if banner_w > max_allowed_w:
        s_factor = max_allowed_w / banner_w
        font_size = max(14, int(round(font_size * s_factor)))
        pad_h = max(6, int(round(pad_h * s_factor)))
        pad_v = max(4, int(round(pad_v * s_factor)))
        try:
            font = ImageFont.truetype(str(font_path), font_size)
        except Exception:
            pass
        line_h = int(round(font_size * 1.25))
        line_layouts = []
        max_line_w = 0
        for runs in line_runs:
            layout_items = []
            cur_w = 0
            for run_text, is_em in runs:
                if is_em and emoji_font:
                    for em in run_text:
                        if ord(em) in (0xFE0E, 0xFE0F):
                            continue
                        item_w = int(round(font_size * 1.05))
                        layout_items.append({"type": "emoji", "glyph": em, "w": item_w, "h": font_size, "x": cur_w})
                        cur_w += item_w
                else:
                    w_px = int(round(font.getlength(run_text)))
                    layout_items.append({"type": "text", "text": run_text, "w": w_px, "h": font_size, "x": cur_w})
                    cur_w += w_px
            line_layouts.append((cur_w, layout_items))
            if cur_w > max_line_w:
                max_line_w = cur_w
        banner_w = max_line_w + pad_h * 2
        banner_h = len(lines) * line_h + pad_v * 2

    im = Image.new("RGBA", (banner_w, banner_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)

    bg_hex = (text_overlay.get("bg_color") or "#000000").lstrip("#")
    if len(bg_hex) == 6:
        bg_r, bg_g, bg_b = int(bg_hex[0:2], 16), int(bg_hex[2:4], 16), int(bg_hex[4:6], 16)
    else:
        bg_r, bg_g, bg_b = 0, 0, 0
    bg_opacity = max(0.0, min(100.0, float(text_overlay.get("bg_opacity") if text_overlay.get("bg_opacity") is not None else 80.0)))
    bg_a = int(round((bg_opacity / 100.0) * 255))

    if bg_a > 0:
        draw.rounded_rectangle([(0, 0), (banner_w - 1, banner_h - 1)], radius=border_radius, fill=(bg_r, bg_g, bg_b, bg_a))

    txt_hex = (text_overlay.get("text_color") or "#FFFFFF").lstrip("#")
    if len(txt_hex) == 6:
        txt_r, txt_g, txt_b = int(txt_hex[0:2], 16), int(txt_hex[2:4], 16), int(txt_hex[4:6], 16)
    else:
        txt_r, txt_g, txt_b = 255, 255, 255

    y_cursor = pad_v
    for line_w, items in line_layouts:
        x_start = pad_h + (max_line_w - line_w) // 2
        for item in items:
            ix = x_start + item["x"]
            if item["type"] == "text":
                draw.text((ix, y_cursor), item["text"], font=font, fill=(txt_r, txt_g, txt_b, 255))
            elif item["type"] == "emoji" and emoji_font:
                em_img = Image.new("RGBA", (emoji_strike, emoji_strike), (0, 0, 0, 0))
                em_draw = ImageDraw.Draw(em_img)
                em_draw.text((0, 0), item["glyph"], font=emoji_font, embedded_color=True)
                target_sz = max(10, int(round(font_size * 0.95)))
                em_resized = em_img.resize((target_sz, target_sz), Image.Resampling.LANCZOS)
                y_off = (line_h - target_sz) // 2
                im.paste(em_resized, (ix, y_cursor + y_off), em_resized)
        y_cursor += line_h

    out_png = work_dir / "text_overlay.png"
    im.save(out_png)
    return out_png


def _text_overlay_stages(
    in_label: str, text_overlay: Optional[dict], w: int, h: int, work_dir: Path, fit_mode: Optional[str] = None
) -> tuple[list[str], str]:
    """Burn the fixed text overlay banner using pixel-perfect PNG with emoji & font support."""
    if not text_overlay or not text_overlay.get("enabled") or not (text_overlay.get("text") or "").strip():
        return [], in_label

    png_path = _render_text_overlay_png(text_overlay, w, h, work_dir)
    if not png_path or not png_path.exists():
        return [], in_label

    px = max(0.0, min(1.0, float(text_overlay.get("pos_x") if text_overlay.get("pos_x") is not None else 50.0) / 100.0))
    py = max(0.0, min(1.0, float(text_overlay.get("pos_y") if text_overlay.get("pos_y") is not None else 16.0) / 100.0))

    is_square = (
        fit_mode == "square"
        or fit_mode == FitMode.SQUARE
        or getattr(fit_mode, "value", None) == "square"
    )
    if is_square:
        inner = max(0, w - 60)
        band = max(0, (h - inner) // 2)
        pos_y_px = int(round(band + py * inner))
    else:
        pos_y_px = int(round(h * py))
    pos_x_px = int(round(w * px))

    rel_png = _rel_for_filter(png_path, work_dir)
    movie_stage = f"movie='{rel_png}'[ov_img]"
    ov_stage = f"[{in_label}][ov_img]overlay=x={pos_x_px}-w/2:y={pos_y_px}-h/2[txtov]"
    return [movie_stage, ov_stage], "txtov"


def _finish_stages(in_label: str, vw: int, vh: int, opts: ClipOptions, work_dir: Path) -> list[str]:
    """Append the cinematic stages, text overlay, signature, then captions.

    Returns the stages that take ``in_label`` -> cinematic effects -> text overlay -> signature -> ``[outv]``.
    """
    cine_stages, cap_in = effects.cinematic_stages(opts.cinematic, in_label, vw, vh)
    txt_stages, txt_in = _text_overlay_stages(cap_in, opts.text_overlay, vw, vh, work_dir, fit_mode=opts.fit_mode)
    sig_stages, sig_in = _signature_stages(txt_in, opts.signature, vw, vh, work_dir)
    return cine_stages + txt_stages + sig_stages + [_caption_stage(sig_in, opts, work_dir)]


def _piecewise_linear(pts: list[tuple[float, float]]) -> str:
    """Build an ffmpeg ``if(lt(t,...),...)`` expression that linearly
    interpolates between ``(time, value)`` points, holding the first/last
    value outside their range. Shared by the pan and zoom expressions below."""
    expr = f"{pts[-1][1]:.6f}"
    for i in range(len(pts) - 2, -1, -1):
        t0, v0 = pts[i]
        t1, v1 = pts[i + 1]
        seg = f"{v1:.6f}" if t1 <= t0 else f"({v0:.6f}+({v1:.6f}-{v0:.6f})*(t-{t0:.3f})/{(t1 - t0):.6f})"
        expr = f"if(lt(t\\,{t1:.3f})\\,{seg}\\,{expr})"
    if len(pts) > 1:
        expr = f"if(lt(t\\,{pts[0][0]:.3f})\\,{pts[0][1]:.6f}\\,{expr})"
    return expr


def _pos_frac_expr(keyframes: list[dict], key: str) -> Optional[str]:
    """ffmpeg eval expression for one pan axis's 0..1 fraction, or None if
    there are no keyframes at all.

    ``keyframes`` are ``{"time", "pos_x", "pos_y", "zoom"}`` dicts (see
    ``app.models.ReframeKeyframe``); ``key`` picks ``pos_x``/``pos_y``.
    Between keyframes the position is linearly interpolated (a smooth pan);
    before the first / after the last, it holds.
    """
    if not keyframes:
        return None
    pts = sorted(
        ((max(0.0, float(k.get("time", 0.0))), max(0.0, min(100.0, float(k.get(key, 50.0)))) / 100.0)
         for k in keyframes),
        key=lambda p: p[0],
    )
    if not pts:
        return None
    return _piecewise_linear(pts)


def _zoom_expr(keyframes: list[dict]) -> Optional[str]:
    """ffmpeg eval expression for the crop's zoom FACTOR (>=1), or None if every
    keyframe is zoom=100 (or there are none) — the common case, where skipping
    this stage keeps the render identical to a build with no zoom support.

    ``zoom`` (see ``app.models.ReframeKeyframe``) is 40-100, the crop box's size
    as a % of the default max-coverage box. This interpolates that percentage
    the same piecewise-linear way as pan, then converts it to a scale factor
    (100/zoom) applied to the pre-crop canvas: 100 -> 1x (no-op), 50 -> 2x
    (scale the canvas up twice as much before cropping the same fixed WxH
    window out of it — i.e. a tighter, more zoomed-in crop).
    """
    if not keyframes:
        return None
    pts = sorted(
        ((max(0.0, float(k.get("time", 0.0))), max(40.0, min(100.0, float(k.get("zoom", 100.0)))))
         for k in keyframes),
        key=lambda p: p[0],
    )
    if not pts or all(abs(z - 100.0) < 0.05 for _, z in pts):
        return None
    return f"(100/({_piecewise_linear(pts)}))"


def _crop_filter(width: int, height: int, reframe: Optional[list[dict]]) -> str:
    """The reframe filter fragment for a cover-scaled frame: an optional zoom
    pre-scale (only emitted when a keyframe actually zooms in) feeding a
    ``crop=...`` that's keyframed if ``reframe`` is set, else ffmpeg's plain
    centred crop (unchanged default behaviour)."""
    kfs = reframe or []
    xf = _pos_frac_expr(kfs, "pos_x")
    yf = _pos_frac_expr(kfs, "pos_y")
    zoom = _zoom_expr(kfs)

    if xf is None and yf is None:
        return f"crop={width}:{height}"
    xf = xf or "0.5"
    yf = yf or "0.5"

    if zoom is not None:
        # Scale the already-covering canvas up further by the zoom factor, then
        # crop the same fixed W:H back out of it — a tighter, more zoomed-in
        # view. The pan offset is computed from the KNOWN base width/height and
        # this SAME zoom expression (not ffmpeg's in_w/in_h): crop does not
        # reliably refresh in_w/in_h per frame when its upstream frame size is
        # itself changing per frame — verified with a real render, where using
        # in_w/in_h here produced an off-centre, runaway-looking zoom instead of
        # a centred one.
        prefix = f"scale=w='iw*{zoom}':h='ih*{zoom}':eval=frame,"
        x_part = f"({width}*{zoom}-{width})*({xf})"
        y_part = f"({height}*{zoom}-{height})*({yf})"
    else:
        prefix = ""
        x_part = f"(in_w-out_w)*({xf})"
        y_part = f"(in_h-out_h)*({yf})"

    # crop's x/y expressions are re-evaluated every frame automatically when
    # they reference time-varying variables like `t` — unlike drawbox/overlay,
    # this filter has no separate `eval` option (passing one is a hard error).
    return f"{prefix}crop={width}:{height}:x='{x_part}':y='{y_part}'"


def _frame_cell_filter(br_tag: str, f: Optional[dict], target_w: int, target_h: int) -> str:
    """Helper to crop and scale one cell of a multi-frame layout."""
    f = f or {}
    fx = max(0.0, min(100.0, float(f.get("x", 0)))) / 100.0
    fy = max(0.0, min(100.0, float(f.get("y", 0)))) / 100.0
    fw = max(0.05, min(1.0 - fx, float(f.get("width", 100)) / 100.0))
    fh = max(0.05, min(1.0 - fy, float(f.get("height", 100)) / 100.0))
    crop = f"crop=w='trunc(iw*{fw:.4f}/2)*2':h='trunc(ih*{fh:.4f}/2)*2':x='trunc(iw*{fx:.4f}/2)*2':y='trunc(ih*{fy:.4f}/2)*2'"
    scale = f"scale={target_w}:{target_h}:force_original_aspect_ratio=increase,crop={target_w}:{target_h}"
    return f"[{br_tag}]{crop},{scale}"


def _build_crop_filter_complex(width: int, height: int, opts: ClipOptions, work_dir: Path) -> str:
    """-filter_complex graph for crop/framing/template modes: multi-frame split, template wrapper, cinematic FX, text overlay, captions."""
    _inject_extra_ass(opts, width, height)
    stages: list[str] = []

    framing = opts.framing or {}
    mode = framing.get("mode", "solo")
    frames = framing.get("frames", [])
    is_multi_frame = mode in ("duo", "triple", "quad") and len(frames) >= 2

    tpl = opts.template or {}
    has_template = tpl.get("preset") in ("twitter", "instagram", "news", "custom")

    num_video_branches = (
        2 if mode == "duo" else
        3 if mode == "triple" else
        4 if mode == "quad" else 1
    ) if is_multi_frame else 1

    total_branches = num_video_branches + (1 if has_template else 0)

    if total_branches > 1:
        branch_names = [f"br{i}" for i in range(total_branches)]
        stages.append(f"[0:v]split={total_branches}" + "".join(f"[{b}]" for b in branch_names))
        if has_template:
            bg_branch = branch_names[0]
            vid_branches = branch_names[1:]
        else:
            bg_branch = None
            vid_branches = branch_names
    else:
        bg_branch = None
        vid_branches = ["0:v"]

    # Build framing layout
    if is_multi_frame:
        if mode == "duo":
            split_pct = max(20.0, min(80.0, float(framing.get("split_pct", 50.0)))) / 100.0
            cell_w = width
            h0 = int(round(height * split_pct / 2)) * 2
            h1 = height - h0
            f0 = frames[0] if len(frames) > 0 else {}
            f1 = frames[1] if len(frames) > 1 else {}
            stages.append(f"{_frame_cell_filter(vid_branches[0], f0, cell_w, h0)}[cell0]")
            stages.append(f"{_frame_cell_filter(vid_branches[1], f1, cell_w, h1)}[cell1]")
            stages.append("[cell0][cell1]vstack[v_frame]")
        elif mode == "triple":
            w0 = (width // 2) - ((width // 2) % 2)
            h0 = height
            w1 = width - w0
            h1 = (height // 2) - ((height // 2) % 2)
            w2 = w1
            h2 = height - h1
            f0 = frames[0] if len(frames) > 0 else {}
            f1 = frames[1] if len(frames) > 1 else {}
            f2 = frames[2] if len(frames) > 2 else {}
            stages.append(f"{_frame_cell_filter(vid_branches[0], f0, w0, h0)}[cell0]")
            stages.append(f"{_frame_cell_filter(vid_branches[1], f1, w1, h1)}[cell1]")
            stages.append(f"{_frame_cell_filter(vid_branches[2], f2, w2, h2)}[cell2]")
            stages.append("[cell1][cell2]vstack[right_stack]")
            stages.append("[cell0][right_stack]hstack[v_frame]")
        elif mode == "quad":
            cell_w = (width // 2) - ((width // 2) % 2)
            cell_h = (height // 2) - ((height // 2) % 2)
            f0 = frames[0] if len(frames) > 0 else {}
            f1 = frames[1] if len(frames) > 1 else {}
            f2 = frames[2] if len(frames) > 2 else {}
            f3 = frames[3] if len(frames) > 3 else {}
            stages.append(f"{_frame_cell_filter(vid_branches[0], f0, cell_w, cell_h)}[cell0]")
            stages.append(f"{_frame_cell_filter(vid_branches[1], f1, cell_w, cell_h)}[cell1]")
            stages.append(f"{_frame_cell_filter(vid_branches[2], f2, cell_w, cell_h)}[cell2]")
            stages.append(f"{_frame_cell_filter(vid_branches[3], f3, cell_w, cell_h)}[cell3]")
            stages.append("[cell0][cell1]hstack[qrow0]")
            stages.append("[cell2][cell3]hstack[qrow1]")
            stages.append("[qrow0][qrow1]vstack[v_frame]")
    else:
        f0 = frames[0] if frames and len(frames) > 0 else None
        if f0 and (f0.get("x", 0) != 0 or f0.get("y", 0) != 0 or f0.get("width", 100) != 100 or f0.get("height", 100) != 100) and not opts.reframe:
            stages.append(f"{_frame_cell_filter(vid_branches[0], f0, width, height)}[v_frame]")
        else:
            stages.append(
                f"[{vid_branches[0]}]scale={width}:{height}:force_original_aspect_ratio=increase,"
                f"{_crop_filter(width, height, opts.reframe)}[v_frame]"
            )

    # Build template wrapper if requested
    if has_template:
        bg_color = "0x15202B" if tpl.get("preset") == "twitter" else "0x0B0E14" if tpl.get("preset") == "news" else "0x000000"
        stages.append(
            f"[{bg_branch}]scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height},drawbox=0:0:iw:ih:{bg_color}:t=fill[tpl_bg]"
        )
        v_scale = max(50.0, min(140.0, float(tpl.get("video_scale") or 100.0))) / 100.0
        v_y_off = max(-50.0, min(50.0, float(tpl.get("video_y_offset") or 0.0))) / 100.0
        scaled_w = int(round(width * v_scale / 2)) * 2
        scaled_h = int(round(height * v_scale / 2)) * 2
        stages.append(f"[v_frame]scale={scaled_w}:{scaled_h}[v_scaled]")
        ov_x = (width - scaled_w) // 2
        ov_y = (height - scaled_h) // 2 + int(round(v_y_off * height))
        stages.append(f"[tpl_bg][v_scaled]overlay={ov_x}:{ov_y}[v_tpl_ov]")
        last_tpl = "v_tpl_ov"

        preset = tpl.get("preset")
        if preset == "news":
            stages.append(f"[{last_tpl}]drawbox=x=40:y={height - 180}:w={width - 80}:h=60:color=0x111827@0.94:t=fill,drawbox=x=40:y={height - 220}:w=260:h=40:color=0xDC2626@0.98:t=fill[tpl_ch0]")
            if _supports_drawtext():
                headline = _escape_drawtext(tpl.get("caption_text") or "LIVE: Special Announcement")
                stages.append(f"[tpl_ch0]drawtext=fontfile={_rel_for_filter(_BAR_FONT, work_dir)}:text='LIVE':fontcolor=white:fontsize=22:x=60:y={height - 212},drawtext=fontfile={_rel_for_filter(_BAR_FONT, work_dir)}:text='{headline}':fontcolor=white:fontsize=24:x=60:y={height - 162}[tpl_done]")
                v_composite = "tpl_done"
            else:
                v_composite = "tpl_ch0"
        elif preset == "twitter":
            stages.append(f"[{last_tpl}]drawbox=x=30:y=60:w={width - 60}:h=170:color=0x1E2732@0.92:t=fill[tw_bg]")
            if _supports_drawtext():
                disp_name = _escape_drawtext(tpl.get("display_name") or "Creator")
                username = _escape_drawtext(tpl.get("username") or "creator")
                caption = _escape_drawtext(tpl.get("caption_text") or "")
                stages.append(f"[tw_bg]drawtext=fontfile={_rel_for_filter(_BAR_FONT, work_dir)}:text='{disp_name}':fontcolor=white:fontsize=26:x=55:y=85,drawtext=fontfile={_rel_for_filter(_BAR_FONT, work_dir)}:text='@{username}':fontcolor=0x8899A6:fontsize=20:x=55:y=120[tw_tx0]")
                if caption:
                    stages.append(f"[tw_tx0]drawtext=fontfile={_rel_for_filter(_BAR_FONT, work_dir)}:text='{caption}':fontcolor=white:fontsize=22:x=55:y=155[tpl_done]")
                    v_composite = "tpl_done"
                else:
                    v_composite = "tw_tx0"
            else:
                v_composite = "tw_bg"
        elif preset == "instagram":
            stages.append(f"[{last_tpl}]drawbox=x=0:y=50:w={width}:h=70:color=0x000000@0.85:t=fill[ig_bg]")
            if _supports_drawtext():
                uname = _escape_drawtext(tpl.get("username") or "creator")
                stages.append(f"[ig_bg]drawtext=fontfile={_rel_for_filter(_BAR_FONT, work_dir)}:text='{uname}':fontcolor=white:fontsize=24:x=40:y=72[tpl_done]")
                v_composite = "tpl_done"
            else:
                v_composite = "ig_bg"
        else:
            v_composite = last_tpl
    else:
        v_composite = "v_frame"

    stages += _finish_stages(v_composite, width, height, opts, work_dir)
    return ";".join(stages)


def _build_square_filter_complex(opts: ClipOptions, work_dir: Path) -> str:
    """-filter_complex graph for square mode.

    Input 0 = source video, input 1 = the rounded mask. We split the source: one
    branch becomes a 9:16 black canvas (so the canvas shares the video's fps and
    timing), the other is cropped to a square and rounded via ``alphamerge``. The
    rounded square is then ``overlay``-composited onto the black canvas — doing
    the compositing explicitly (rather than ``pad`` + dropping the alpha at encode)
    is what makes the soft corners actually survive into the rendered pixels.
    """
    s = _SQUARE_INNER
    w, h = _SQUARE_CANVAS
    mx, my = (w - s) // 2, (h - s) // 2
    _inject_extra_ass(opts, w, h)

    stages = [
        "[0:v]split[base][fg]",
        f"[base]scale={w}:{h}:force_original_aspect_ratio=increase,"
        f"crop={w}:{h},drawbox=0:0:iw:ih:black:t=fill[bg]",
        f"[fg]scale={s}:{s}:force_original_aspect_ratio=increase,"
        f"{_crop_filter(s, s, opts.reframe)}[fgsq]",
    ]

    # Cinematic FX go on the SQUARE itself (vw=vh=s) — exactly the region the live
    # preview grades — so gradients/vignette/grade land on the footage, not on the
    # black canvas around it. (Crop mode applies them to the full frame instead.)
    cine_stages, sq_cine = effects.cinematic_stages(opts.cinematic, "fgsq", s, s)
    stages += cine_stages

    stages += [
        f"[{sq_cine}]format=yuva420p[sq]",
        f"[1:v]format=gray,scale={s}:{s}[m]",
        "[sq][m]alphamerge[r]",
        f"[bg][r]overlay={mx}:{my}[ov]",
    ]
    last = "ov"

    if _supports_drawtext() and opts.bar_text and opts.bar_text.strip():
        # Title can be MULTI-LINE (the UI sends \n for Shift+Enter). Each line is a
        # separate drawtext, stacked, so the whole block sits in the top black band
        # just above the square.
        lines = [ln.strip() for ln in opts.bar_text.split("\n") if ln.strip()][:3]
        font_size = max(28, int(round(h * 0.040)))
        line_h = int(round(font_size * 1.3))
        block_h = line_h * len(lines)
        start_y = max(16, my - block_h - 22)  # bottom of block ~22px above the square
        col = (opts.bar_text_color or "#FFFFFF").replace("#", "0x")
        anim = (opts.bar_text_anim or "none").lower()
        # Entrance animation (commas escaped for the filtergraph expression parser):
        #   fade  → alpha ramps 0→1 over 0.5s; slide → drops in from ~40px below.
        alpha_expr = ":alpha='if(lt(t\\,0.5)\\,t/0.5\\,1)'" if anim == "fade" else ""
        for li, ln in enumerate(lines):
            base_y = start_y + li * line_h
            y = (f"'{base_y}+40*(1-min(t/0.45\\,1))'" if anim == "slide" else str(base_y))
            stages.append(
                f"[{last}]drawtext=fontfile={_rel_for_filter(_BAR_FONT, work_dir)}:"
                f"text='{_escape_drawtext(ln)}':"
                f"fontcolor={col}:fontsize={font_size}:x=(w-text_w)/2:y={y}{alpha_expr}:"
                f"borderw=3:bordercolor=black@0.85[ttl{li}]"
            )
            last = f"ttl{li}"

    # Fixed text overlay, signature/watermark, then captions, on the composited canvas.
    txt_stages, last = _text_overlay_stages(last, opts.text_overlay, w, h, work_dir, fit_mode="square")
    stages += txt_stages
    sig_stages, last = _signature_stages(last, opts.signature, w, h, work_dir)
    stages += sig_stages
    stages.append(_caption_stage(last, opts, work_dir))
    return ";".join(stages)


def _music_audio_graph(mus_idx: int, volume: float, duck: float = 70.0) -> str:
    """Filtergraph that mixes a background track UNDER the original audio, reels-style.

    The voice is split: one copy is the sidechain key for ``sidechaincompress``,
    which automatically ducks the music whenever the speaker is talking, and one
    copy is mixed back at full level. So you hear the voice clearly with music
    filling the gaps — never a wall of loud music. ``normalize=0`` keeps the voice
    at unity gain instead of amix halving everything.

    ``volume`` (0-100) sets the music's resting loudness; ``duck`` (0-100) sets how
    hard the music dips while someone is talking, by scaling the sidechain
    compression ratio: 0 leaves the music steady (ratio ≈ 1), 100 pulls it down
    aggressively (ratio ≈ 20) so the voice always cuts through.

    Input 0's audio is the source voice; ``mus_idx`` is the music input's index.
    Produces the ``[aout]`` label the caller maps as the output audio.
    """
    base = max(0.0, min(1.0, (volume if volume is not None else 35) / 100.0 * 0.7))
    d = max(0.0, min(1.0, (duck if duck is not None else 70) / 100.0))
    ratio = 1.0 + d * 19.0  # 0 → 1 (no ducking), 100 → 20 (hard ducking)
    return (
        f"[0:a]asplit=2[__v1][__v2];"
        f"[{mus_idx}:a]volume={base:.3f},aresample=async=1[__m];"
        f"[__m][__v2]sidechaincompress=threshold=0.02:ratio={ratio:.2f}:attack=15:release=300[__md];"
        f"[__v1][__md]amix=inputs=2:duration=first:normalize=0[aout]"
    )


# Shared output-encoding args (everything after the filter graph).
_ENCODE_ARGS = [
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
]


def generate_clip(source_mp4: Path, start: float, end: float, opts: ClipOptions) -> Path:
    """Cut [start, end] from `source_mp4`, reframe + caption it, return the mp4.

    Raises:
        ClipGenerationError: if ffmpeg is missing or fails.
    """
    duration = max(0.1, end - start)

    out_dir = (CLIPS_DIR / opts.clip_id).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{opts.index}.mp4"

    src = str(Path(source_mp4).resolve())

    has_music = opts.music_path is not None and Path(opts.music_path).is_file()

    # ffmpeg runs with cwd = out_dir so in-filtergraph paths can be relative (no
    # Windows drive colon / spaces). Inputs/outputs are absolute argv, which is fine.
    if opts.fit_mode == FitMode.SQUARE:
        radius = _SQUARE_RADIUS if opts.square_corners != "square" else 0
        mask = ensure_rounded_mask(radius=radius)
        fc = _build_square_filter_complex(opts, out_dir)
        inputs = ["-ss", f"{start:.3f}", "-i", src, "-loop", "1", "-i", str(mask.resolve())]
        music_idx = 2  # 0 = source, 1 = mask
        tail = ["-shortest"]
    else:
        width, height = target_size(opts.aspect_ratio, opts.fit_mode)
        fc = _build_crop_filter_complex(width, height, opts, out_dir)
        inputs = ["-ss", f"{start:.3f}", "-i", src]
        music_idx = 1  # 0 = source
        tail = []

    # Background music: loop the track, mix it under the audio, duck it under speech.
    # ``music_start`` seeks into the track first (so a chosen beat lands at the clip
    # start); ``-ss`` before ``-i`` applies to the looped input's first pass.
    if has_music:
        seek = ["-ss", f"{max(0.0, opts.music_start):.2f}"] if opts.music_start and opts.music_start > 0 else []
        inputs += ["-stream_loop", "-1", *seek, "-i", str(Path(opts.music_path).resolve())]
        fc = fc + ";" + _music_audio_graph(music_idx, opts.music_volume, opts.music_duck)
        audio_map = ["-map", "[aout]"]
    else:
        audio_map = ["-map", "0:a?"]

    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-t", f"{duration:.3f}",
        "-filter_complex", fc,
        "-map", "[outv]", *audio_map,
        *_ENCODE_ARGS,
        *tail,
        str(out_path),
    ]

    logger.info("Rendering clip %d (cwd=%s): %s", opts.index, out_dir, " ".join(cmd))

    try:
        proc = subprocess.run(
            cmd,
            cwd=str(out_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except FileNotFoundError as exc:
        raise ClipGenerationError(
            "ffmpeg was not found on PATH. Install it (winget/brew/apt) — it "
            "does the cutting, reframing, and caption burning."
        ) from exc
    except Exception as exc:  # noqa: BLE001
        raise ClipGenerationError(f"Failed to run ffmpeg: {exc}") from exc

    if proc.returncode != 0 or not out_path.exists():
        # Surface the tail of ffmpeg's stderr — it usually pinpoints the problem.
        tail = (proc.stderr or "").strip().splitlines()[-12:]
        raise ClipGenerationError(
            "ffmpeg failed to render the clip:\n" + "\n".join(tail)
        )

    return out_path
