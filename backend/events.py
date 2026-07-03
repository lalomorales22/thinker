"""
Tiny WebSocket event hub for real-time job/metric updates.

The old backend had a WebSocket endpoint that only echoed whatever it received
and a frontend that displayed a hardcoded "WebSocket connected" line. This hub
lets any route publish a structured event that is fanned out to every connected
client, so the dashboard/terminal reflect what is actually happening.
"""
from __future__ import annotations

import asyncio
from typing import Any

from utils import logger


class Hub:
    def __init__(self) -> None:
        self._clients: set[Any] = set()

    async def connect(self, ws) -> None:
        await ws.accept()
        self._clients.add(ws)
        logger.info(f"WS client connected ({len(self._clients)} total)")

    def disconnect(self, ws) -> None:
        self._clients.discard(ws)
        logger.info(f"WS client disconnected ({len(self._clients)} total)")

    @property
    def count(self) -> int:
        return len(self._clients)

    async def broadcast(self, message: dict[str, Any]) -> None:
        dead = []
        for ws in list(self._clients):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._clients.discard(ws)

    def publish(self, message: dict[str, Any]) -> None:
        """Fire-and-forget broadcast, safe to call from sync code on the loop."""
        try:
            asyncio.get_running_loop().create_task(self.broadcast(message))
        except RuntimeError:
            # No running loop (e.g. called from a plain thread) — drop silently.
            pass


hub = Hub()
