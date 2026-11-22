"""Model Context Protocol (MCP) Server for Buffer.com social scheduling.

Exposes standard JSON-RPC 2.0 stdio tools to AI agents (Antigravity, Claude, etc.)
allowing autonomous discovery of social channels, video scheduling, and queue inspection.

Usage:
    python -m app.mcp_buffer
"""

from __future__ import annotations

import json
import logging
import sys
from typing import Any, Dict

from . import buffer_service

logging.basicConfig(level=logging.INFO, stream=sys.stderr, format="[MCP Buffer] %(message)s")
logger = logging.getLogger("mcp_buffer")

TOOLS = [
    {
        "name": "buffer_list_channels",
        "description": "List all connected social media channels in the user's Buffer.com account (TikTok, Instagram Reels, YouTube Shorts, X/Twitter, LinkedIn, Facebook).",
        "inputSchema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "buffer_schedule_clip",
        "description": "Schedule or immediately publish a video clip to one or more connected Buffer social channels.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "profile_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of Buffer profile IDs to post to. Use buffer_list_channels to retrieve IDs.",
                },
                "text": {
                    "type": "string",
                    "description": "Caption, post copy, and hashtags for the short.",
                },
                "media_url": {
                    "type": "string",
                    "description": "Directly accessible web URL of the video MP4 file.",
                },
                "now": {
                    "type": "boolean",
                    "description": "If true, publish immediately instead of scheduling.",
                    "default": False,
                },
                "scheduled_at": {
                    "type": "integer",
                    "description": "Unix timestamp in seconds for when the post should go live (optional).",
                },
                "title": {
                    "type": "string",
                    "description": "Optional title for YouTube Shorts or Instagram Reels.",
                },
            },
            "required": ["profile_ids", "text", "media_url"],
        },
    },
    {
        "name": "buffer_get_queue",
        "description": "Inspect upcoming scheduled posts in the Buffer queue for a given profile ID.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "profile_id": {
                    "type": "string",
                    "description": "The Buffer profile ID to query pending updates for.",
                },
            },
            "required": ["profile_id"],
        },
    },
]


def handle_initialize(params: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "protocolVersion": "2024-11-05",
        "capabilities": {
            "tools": {},
        },
        "serverInfo": {
            "name": "clipforge-buffer-mcp",
            "version": "1.0.0",
        },
    }


def handle_tools_list() -> Dict[str, Any]:
    return {"tools": TOOLS}


def handle_tools_call(params: Dict[str, Any]) -> Dict[str, Any]:
    name = params.get("name")
    args = params.get("arguments") or {}

    try:
        if name == "buffer_list_channels":
            profiles = buffer_service.get_profiles()
            return {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(profiles, indent=2),
                    }
                ]
            }

        elif name == "buffer_schedule_clip":
            profile_ids = args.get("profile_ids", [])
            text = args.get("text", "")
            media_url = args.get("media_url")
            now = bool(args.get("now", False))
            scheduled_at = args.get("scheduled_at")
            title = args.get("title")

            res = buffer_service.schedule_post(
                profile_ids=profile_ids,
                text=text,
                media_url=media_url,
                scheduled_at=scheduled_at,
                now=now,
                title=title,
            )
            return {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(res, indent=2),
                    }
                ]
            }

        elif name == "buffer_get_queue":
            profile_id = args.get("profile_id", "")
            updates = buffer_service.get_pending_updates(profile_id)
            return {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(updates, indent=2),
                    }
                ]
            }

        else:
            return {
                "isError": True,
                "content": [{"type": "text", "text": f"Unknown tool: {name}"}],
            }

    except Exception as exc:
        logger.exception("Error executing tool %s: %s", name, exc)
        return {
            "isError": True,
            "content": [{"type": "text", "text": f"Error: {str(exc)}"}],
        }


def run_stdio_server() -> None:
    logger.info("ClipForge Buffer MCP server running on stdio...")
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            line = line.strip()
            if not line:
                continue

            req = json.loads(line)
            req_id = req.get("id")
            method = req.get("method")
            params = req.get("params") or {}

            if method == "initialize":
                res = handle_initialize(params)
                sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": req_id, "result": res}) + "\n")
                sys.stdout.flush()

            elif method == "notifications/initialized":
                # Notification, no response
                pass

            elif method == "ping":
                sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": req_id, "result": {}}) + "\n")
                sys.stdout.flush()

            elif method == "tools/list":
                res = handle_tools_list()
                sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": req_id, "result": res}) + "\n")
                sys.stdout.flush()

            elif method == "tools/call":
                res = handle_tools_call(params)
                sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": req_id, "result": res}) + "\n")
                sys.stdout.flush()

            else:
                sys.stdout.write(json.dumps({
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {"code": -32601, "message": f"Method not found: {method}"}
                }) + "\n")
                sys.stdout.flush()

        except json.JSONDecodeError as err:
            logger.error("JSON decode error: %s", err)
        except Exception as exc:
            logger.exception("MCP server unhandled error: %s", exc)


if __name__ == "__main__":
    run_stdio_server()
