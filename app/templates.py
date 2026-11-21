"""Project preset templates management.

Stores and loads full project layout templates (framing layout, caption styling,
positioning, fixed text overlays, watermark, cinematic grade, aspect ratio, etc.)
so users can save workflows and reuse them across different videos.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from .paths import ROOT_DIR

logger = logging.getLogger(__name__)
TEMPLATES_FILE = ROOT_DIR / "clipforge_templates.json"

DEFAULT_TEMPLATES: List[Dict[str, Any]] = [
    {
        "id": "tpl_duo_split",
        "name": "Gaming Duo (50/50 Split)",
        "description": "Two equal stacked vertical frames: top facecam, bottom gameplay with bold yellow captions.",
        "is_default": True,
        "framing": {
            "mode": "duo",
            "split_pct": 50,
            "frames": [
                {"x": 0.0, "y": 0.0, "width": 100.0, "height": 50.0, "aspect_ratio": "custom"},
                {"x": 0.0, "y": 50.0, "width": 100.0, "height": 50.0, "aspect_ratio": "custom"},
            ],
        },
        "caption": {
            "preset": "alex_caps",
            "pos_x": 50.0,
            "pos_y": 88.0,
            "overrides": {},
        },
        "text_overlay": {
            "enabled": True,
            "text": "WATCH TILL THE END 😱",
            "font_family": "Roboto",
            "font_size": 52,
            "text_color": "#FFFFFF",
            "bg_color": "#000000",
            "bg_opacity": 80,
            "padding": 16,
            "border_radius": 12,
            "pos_x": 50.0,
            "pos_y": 14.0,
        },
        "template_config": {"preset": "none"},
        "output": {
            "aspect": "9:16",
            "fit": "crop",
            "square_corners": "round",
            "bar_text": "",
            "bar_text_color": "#FFFFFF",
            "bar_text_anim": "none",
        },
        "signature": {
            "enabled": False,
            "text": "@clipforge",
            "pos_x": 50.0,
            "pos_y": 92.0,
            "size": 34.0,
            "color": "#FFFFFF",
            "opacity": 75.0,
        },
        "cinematic": {
            "color_grade": "vibrant",
            "vignette": True,
            "vignette_strength": 0.0,
        },
    },
    {
        "id": "tpl_podcast_reaction",
        "name": "Podcast Reaction (30/70 Duo)",
        "description": "Top 30% reaction/facecam with bottom 70% main video footage.",
        "is_default": True,
        "framing": {
            "mode": "duo",
            "split_pct": 30,
            "frames": [
                {"x": 0.0, "y": 0.0, "width": 100.0, "height": 30.0, "aspect_ratio": "custom"},
                {"x": 0.0, "y": 30.0, "width": 100.0, "height": 70.0, "aspect_ratio": "custom"},
            ],
        },
        "caption": {
            "preset": "hormozi_yellow",
            "pos_x": 50.0,
            "pos_y": 88.0,
            "overrides": {},
        },
        "text_overlay": {
            "enabled": False,
            "text": "WAIT FOR IT… 🔥",
            "font_family": "Montserrat",
            "font_size": 52,
            "text_color": "#FFFFFF",
            "bg_color": "#000000",
            "bg_opacity": 80,
            "padding": 16,
            "border_radius": 12,
            "pos_x": 50.0,
            "pos_y": 14.0,
        },
        "template_config": {"preset": "none"},
        "output": {
            "aspect": "9:16",
            "fit": "crop",
            "square_corners": "round",
            "bar_text": "",
            "bar_text_color": "#FFFFFF",
            "bar_text_anim": "none",
        },
        "signature": {
            "enabled": False,
            "text": "@creator",
            "pos_x": 50.0,
            "pos_y": 92.0,
            "size": 34.0,
            "color": "#FFFFFF",
            "opacity": 75.0,
        },
        "cinematic": {
            "color_grade": "none",
        },
    },
    {
        "id": "tpl_solo_viral",
        "name": "Viral Shorts (Solo 9:16 Full)",
        "description": "Full vertical crop with centered Hormozi-style captions and vibrant color grade.",
        "is_default": True,
        "framing": {
            "mode": "solo",
            "split_pct": 50,
            "frames": [
                {"x": 25.0, "y": 10.0, "width": 50.0, "height": 80.0, "aspect_ratio": "9:16"}
            ],
        },
        "caption": {
            "preset": "hormozi_green",
            "pos_x": 50.0,
            "pos_y": 75.0,
            "overrides": {},
        },
        "text_overlay": {
            "enabled": False,
            "text": "IMPORTANT NOTICE 🚨",
            "font_family": "Roboto",
            "font_size": 52,
            "text_color": "#FFFFFF",
            "bg_color": "#000000",
            "bg_opacity": 80,
            "padding": 16,
            "border_radius": 12,
            "pos_x": 50.0,
            "pos_y": 16.0,
        },
        "template_config": {"preset": "none"},
        "output": {
            "aspect": "9:16",
            "fit": "crop",
            "square_corners": "round",
            "bar_text": "",
            "bar_text_color": "#FFFFFF",
            "bar_text_anim": "none",
        },
        "signature": {
            "enabled": False,
            "text": "@clipforge",
            "pos_x": 50.0,
            "pos_y": 92.0,
            "size": 34.0,
            "color": "#FFFFFF",
            "opacity": 75.0,
        },
        "cinematic": {
            "color_grade": "vibrant",
        },
    },
]


def list_templates() -> List[Dict[str, Any]]:
    """Return all templates (defaults plus user-saved)."""
    if not TEMPLATES_FILE.exists():
        try:
            TEMPLATES_FILE.write_text(json.dumps(DEFAULT_TEMPLATES, indent=2), encoding="utf-8")
        except Exception as e:
            logger.warning(f"Could not seed default templates file: {e}")
        return DEFAULT_TEMPLATES

    try:
        data = json.loads(TEMPLATES_FILE.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data
    except Exception as e:
        logger.error(f"Failed to read templates file: {e}")
    return DEFAULT_TEMPLATES


def save_template(template: Dict[str, Any]) -> Dict[str, Any]:
    """Save or update a template."""
    current = list_templates()
    tpl_id = template.get("id")
    if not tpl_id:
        tpl_id = f"tpl_{int(time.time() * 1000)}"
        template["id"] = tpl_id

    template["updated_at"] = time.time()
    existing_idx = next((i for i, t in enumerate(current) if t.get("id") == tpl_id), None)
    if existing_idx is not None:
        current[existing_idx] = {**current[existing_idx], **template}
        saved_item = current[existing_idx]
    else:
        current.append(template)
        saved_item = template

    try:
        TEMPLATES_FILE.write_text(json.dumps(current, indent=2), encoding="utf-8")
    except Exception as e:
        logger.error(f"Failed to save template to file: {e}")

    return saved_item


def delete_template(template_id: str) -> bool:
    """Delete a user template by id."""
    current = list_templates()
    filtered = [t for t in current if t.get("id") != template_id]
    if len(filtered) == len(current):
        return False

    try:
        TEMPLATES_FILE.write_text(json.dumps(filtered, indent=2), encoding="utf-8")
        return True
    except Exception as e:
        logger.error(f"Failed to delete template: {e}")
        return False
