"""Buffer.com integration service for scheduling and posting social clips.

Connects to the Buffer Publish API (https://api.bufferapp.com/1/) to retrieve
connected social profiles (TikTok, Instagram Reels, YouTube Shorts, X/Twitter, etc.)
and post/schedule video updates.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional
import urllib.parse
import urllib.request
import urllib.error

from .paths import CONFIG_FILE

logger = logging.getLogger("app.buffer")

BUFFER_API_BASE = "https://api.bufferapp.com/1"


def _read_config() -> Dict[str, Any]:
    if CONFIG_FILE.is_file():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            logger.debug("Could not read config file: %s", exc)
    return {}


def _save_config(updates: Dict[str, Any]) -> Dict[str, Any]:
    data = _read_config()
    data.update(updates)
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as exc:
        logger.warning("Could not save config to %s: %s", CONFIG_FILE, exc)
    return data


def get_access_token() -> Optional[str]:
    """Return Buffer access token from config file or environment variable."""
    if env_token := os.environ.get("BUFFER_ACCESS_TOKEN"):
        return env_token.strip()
    token = _read_config().get("buffer_access_token")
    return token.strip() if token else None


def set_access_token(token: str) -> None:
    """Save Buffer access token in local configuration."""
    _save_config({"buffer_access_token": (token or "").strip()})


def get_public_base_url() -> Optional[str]:
    """Return configured public base URL (e.g. https://xyz.ngrok.app or custom domain)."""
    if env_url := os.environ.get("CLIPFORGE_PUBLIC_URL"):
        return env_url.strip().rstrip("/")
    url = _read_config().get("buffer_public_base_url")
    return url.strip().rstrip("/") if url else None


def set_public_base_url(url: str) -> None:
    """Save public base URL in local configuration."""
    _save_config({"buffer_public_base_url": (url or "").strip().rstrip("/")})


def _make_request(endpoint: str, method: str = "GET", data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    token = get_access_token()
    if not token:
        raise ValueError("Buffer access token is not configured. Please add it in Settings.")

    url = f"{BUFFER_API_BASE}/{endpoint.lstrip('/')}"
    headers = {
        "User-Agent": "ClipForge/1.0",
        "Authorization": f"Bearer {token}",
    }

    req_data = None
    if method == "POST":
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        if data:
            # Handle array query params (e.g. profile_ids[])
            encoded_pairs = []
            for k, v in data.items():
                if isinstance(v, (list, tuple)):
                    for item in v:
                        encoded_pairs.append((f"{k}[]" if not k.endswith("[]") else k, str(item)))
                elif v is not None:
                    encoded_pairs.append((k, str(v) if not isinstance(v, bool) else ("1" if v else "0")))
            req_data = urllib.parse.urlencode(encoded_pairs).encode("utf-8")
    else:
        # GET request with token query param fallback
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}access_token={urllib.parse.quote(token)}"

    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="ignore")
        logger.error("Buffer HTTP error %d: %s", exc.code, err_body)
        try:
            err_json = json.loads(err_body)
            msg = err_json.get("message") or err_json.get("error") or str(exc)
        except Exception:
            msg = f"Buffer API error: HTTP {exc.code} - {err_body[:200]}"
        raise RuntimeError(msg) from exc
    except Exception as exc:
        logger.error("Buffer connection error: %s", exc)
        raise RuntimeError(f"Buffer connection failed: {exc}") from exc


def test_connection() -> Dict[str, Any]:
    """Test connection and return user account info."""
    token = get_access_token()
    if not token:
        return {"configured": False, "ok": False, "message": "No Buffer access token configured"}
    try:
        user = _make_request("user.json")
        return {
            "configured": True,
            "ok": True,
            "user": {
                "id": user.get("id"),
                "name": user.get("name"),
                "email": user.get("email"),
                "plan": user.get("plan"),
            },
        }
    except Exception as exc:
        return {"configured": True, "ok": False, "error": str(exc)}


def get_profiles() -> List[Dict[str, Any]]:
    """Return list of connected social profiles from Buffer."""
    raw = _make_request("profiles.json")
    if not isinstance(raw, list):
        return []
    profiles = []
    for p in raw:
        if not isinstance(p, dict):
            continue
        service = p.get("service", "unknown").lower()
        profiles.append({
            "id": p.get("id"),
            "service": service,
            "username": p.get("formatted_username") or p.get("service_username") or p.get("service"),
            "avatar": p.get("avatar") or p.get("avatar_https"),
            "service_type": p.get("service_type"),
            "default": bool(p.get("default", False)),
            "schedules": p.get("schedules", []),
            "timezone": p.get("timezone"),
        })
    return profiles


def schedule_post(
    profile_ids: List[str],
    text: str,
    media_url: Optional[str] = None,
    scheduled_at: Optional[int] = None,
    now: bool = False,
    title: Optional[str] = None,
) -> Dict[str, Any]:
    """Schedule or immediately publish an update across one or more Buffer profiles.

    Args:
        profile_ids: List of Buffer profile IDs to publish to.
        text: Caption / post body text.
        media_url: Direct accessible URL to the video file.
        scheduled_at: Optional Unix epoch timestamp to schedule.
        now: If True, post immediately.
        title: Optional title for video media (used by YouTube Shorts / Reels).
    """
    if not profile_ids:
        raise ValueError("At least one profile ID must be selected.")
    if not text.strip() and not media_url:
        raise ValueError("Either caption text or a media URL is required.")

    payload: Dict[str, Any] = {
        "profile_ids": profile_ids,
        "text": text.strip(),
        "shorten": "false",
    }

    if now:
        payload["now"] = "1"
    elif scheduled_at and scheduled_at > 0:
        payload["scheduled_at"] = str(scheduled_at)

    if media_url:
        payload["media[video]"] = media_url.strip()
        if title:
            payload["media[title]"] = title.strip()

    res = _make_request("updates/create.json", method="POST", data=payload)
    return res


def get_pending_updates(profile_id: str) -> List[Dict[str, Any]]:
    """Return pending scheduled updates for a specific profile."""
    res = _make_request(f"profiles/{urllib.parse.quote(profile_id)}/updates/pending.json")
    return res.get("updates", [])
