"""Buffer.com integration service using Buffer's official Remote MCP Server.

Buffer Official MCP Endpoint: https://mcp.buffer.com/mcp
Tools used:
- get_account: Retrieves authenticated user info and organization ID
- list_channels: Retrieves all connected channels (TikTok, Instagram, YouTube, X, etc.)
- create_post: Schedules or immediately publishes videos and updates to channels
- list_posts: Inspects upcoming posts and drafts
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
import logging
import os
import ssl
from typing import Any, Dict, List, Optional
import urllib.error
import urllib.parse
import urllib.request

from .paths import CONFIG_FILE

logger = logging.getLogger("app.buffer")

# Automatically load .env if present
try:
    from dotenv import load_dotenv
    load_dotenv(CONFIG_FILE.parent / ".env")
except Exception:
    pass

BUFFER_MCP_URL = "https://mcp.buffer.com/mcp"


def _get_ssl_context() -> ssl.SSLContext:
    """Return SSL context using certifi CA bundle if available (essential for macOS Python)."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        try:
            return ssl.create_default_context()
        except Exception:
            return ssl._create_unverified_context()


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


def _call_mcp_tool(tool_name: str, arguments: Optional[Dict[str, Any]] = None) -> Any:
    """Call an MCP tool on Buffer's official HTTP MCP server."""
    token = get_access_token()
    if not token:
        raise ValueError("Buffer access token is not configured. Please add it in Settings.")

    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments or {},
        },
    }

    req_bytes = json.dumps(payload).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "User-Agent": "ClipForge/1.0",
    }

    req = urllib.request.Request(BUFFER_MCP_URL, data=req_bytes, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=30, context=_get_ssl_context()) as resp:
            resp_body = resp.read().decode("utf-8")
            data = json.loads(resp_body)
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="ignore")
        logger.error("Buffer MCP HTTP error %d: %s", exc.code, err_body)
        try:
            err_json = json.loads(err_body)
            msg = err_json.get("error", {}).get("message") or err_json.get("message") or str(exc)
        except Exception:
            msg = f"Buffer MCP HTTP {exc.code}: {err_body[:200]}"
        raise RuntimeError(msg) from exc
    except Exception as exc:
        logger.error("Buffer MCP connection error: %s", exc)
        raise RuntimeError(f"Buffer MCP connection failed: {exc}") from exc

    if "error" in data:
        err_msg = data["error"].get("message", "Unknown error")
        raise RuntimeError(f"Buffer MCP error: {err_msg}")

    result = data.get("result", {})
    if result.get("isError"):
        content_items = result.get("content", [])
        err_text = " ".join(item.get("text", "") for item in content_items if isinstance(item, dict))
        raise RuntimeError(f"Buffer MCP tool error: {err_text or 'Command failed'}")

    # Tool returns content array with text blocks
    content_list = result.get("content", [])
    if not content_list:
        return {}

    first_text = content_list[0].get("text", "")
    try:
        return json.loads(first_text)
    except Exception:
        return first_text


def get_account_info() -> Dict[str, Any]:
    """Retrieve authenticated user and organization information via Buffer MCP."""
    return _call_mcp_tool("get_account")


def test_connection() -> Dict[str, Any]:
    """Test connection and return user account info."""
    token = get_access_token()
    if not token:
        return {"configured": False, "ok": False, "message": "No Buffer access token configured"}
    try:
        acc = get_account_info()
        orgs = acc.get("organizations", [])
        primary_org = orgs[0] if orgs else {}
        return {
            "configured": True,
            "ok": True,
            "user": {
                "id": acc.get("id"),
                "name": acc.get("name"),
                "email": acc.get("email"),
                "timezone": acc.get("timezone"),
                "organization_id": primary_org.get("id"),
                "organization_name": primary_org.get("name"),
            },
        }
    except Exception as exc:
        return {"configured": True, "ok": False, "error": str(exc)}


def get_profiles() -> List[Dict[str, Any]]:
    """Return list of connected social profiles (channels) from Buffer."""
    acc = get_account_info()
    orgs = acc.get("organizations", [])
    if not orgs:
        return []
    org_id = orgs[0].get("id")
    if not org_id:
        return []

    channels = _call_mcp_tool("list_channels", {"organizationId": org_id})
    if not isinstance(channels, list):
        return []

    profiles: List[Dict[str, Any]] = []
    for ch in channels:
        if not isinstance(ch, dict):
            continue
        service = (ch.get("service") or "unknown").lower()
        profiles.append({
            "id": ch.get("id"),
            "service": service,
            "username": ch.get("displayName") or ch.get("name") or service,
            "name": ch.get("name"),
            "avatar": ch.get("avatar"),
            "service_type": ch.get("type"),
            "default": False,
            "isDisconnected": bool(ch.get("isDisconnected", False)),
            "isLocked": bool(ch.get("isLocked", False)),
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
        profile_ids: List of Buffer channel IDs to publish to.
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

    if media_url:
        parsed = urllib.parse.urlparse(media_url.strip())
        hostname = (parsed.hostname or "").lower()
        if hostname in ("localhost", "127.0.0.1", "0.0.0.0"):
            raise ValueError(
                "Buffer cannot access videos hosted on 'localhost' or '127.0.0.1'. "
                "Buffer's cloud servers need a publicly reachable URL to ingest the video. "
                "Please configure a public tunnel URL in Settings (e.g. run 'ngrok http 8000' and paste the ngrok URL into 'Public Media Base URL') or provide a public video link."
            )

    # Fetch channels map to detect service types for platform-specific metadata
    profiles = get_profiles()
    channel_map = {p["id"]: p for p in profiles}

    # Determine mode & dueAt
    if now:
        mode = "shareNow"
        due_at = None
    elif scheduled_at and scheduled_at > 0:
        mode = "customScheduled"
        # Convert unix timestamp to ISO 8601 UTC
        due_at = datetime.fromtimestamp(scheduled_at, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    else:
        mode = "addToQueue"
        due_at = None

    results = []
    errors = []

    for cid in profile_ids:
        ch = channel_map.get(cid, {})
        service = ch.get("service", "").lower()

        args: Dict[str, Any] = {
            "channelId": cid,
            "schedulingType": "automatic",
            "mode": mode,
            "text": text.strip(),
        }

        if due_at:
            args["dueAt"] = due_at

        if media_url:
            args["assets"] = [{"video": {"url": media_url.strip()}}]

        # Platform specific metadata
        clean_title = (title or text.strip()[:95] or "Short").strip()
        metadata: Dict[str, Any] = {}

        if service == "instagram":
            metadata["instagram"] = {
                "type": "reel",
                "shouldShareToFeed": True,
            }
        elif service == "youtube":
            metadata["youtube"] = {
                "title": clean_title,
                "categoryId": "22",  # People & Blogs default
            }
        elif service == "tiktok":
            metadata["tiktok"] = {
                "title": clean_title,
            }

        if metadata:
            args["metadata"] = metadata

        try:
            res = _call_mcp_tool("create_post", args)
            results.append({"channelId": cid, "service": service, "status": "ok", "post": res})
        except Exception as exc:
            logger.error("Failed to post to channel %s (%s): %s", cid, service, exc)
            errors.append({"channelId": cid, "service": service, "error": str(exc)})

    if not results and errors:
        raise RuntimeError(f"Buffer posting failed: {errors[0]['error']}")

    return {
        "success": len(results) > 0,
        "mode": mode,
        "results": results,
        "errors": errors,
    }


def get_pending_updates(profile_id: str) -> List[Dict[str, Any]]:
    """Return pending scheduled updates for a specific channel."""
    acc = get_account_info()
    orgs = acc.get("organizations", [])
    if not orgs:
        return []
    org_id = orgs[0].get("id")

    res = _call_mcp_tool("list_posts", {
        "organizationId": org_id,
        "channelIds": [profile_id],
        "status": ["scheduled", "draft"],
    })
    return res if isinstance(res, list) else []
