"""Playback and volume control."""

from __future__ import annotations

from app.bluos.transport import BluOSTransport


class BluOSPlaybackMixin(BluOSTransport):
    async def play(self, ip: str) -> bool:
        return (await self._get(ip, "/Play", control=True)) is not None

    async def pause(self, ip: str) -> bool:
        return (await self._get(ip, "/Pause", control=True)) is not None

    async def stop(self, ip: str) -> bool:
        return (await self._get(ip, "/Stop", control=True)) is not None

    async def skip(self, ip: str) -> bool:
        return (await self._get(ip, "/Skip", control=True)) is not None

    async def back(self, ip: str) -> bool:
        return (await self._get(ip, "/Back", control=True)) is not None

    async def toggle(self, ip: str, *, state: str) -> bool:
        if state in ("play", "stream", "connecting"):
            return await self.pause(ip)
        return await self.play(ip)

    async def set_volume(self, ip: str, level: int) -> bool:
        level = max(0, min(100, level))
        return (await self._get(ip, "/Volume", query=f"level={level}", control=True)) is not None

    async def adjust_volume(self, ip: str, delta: int, current_level: int) -> bool:
        level = max(0, min(100, current_level + delta))
        return await self.set_volume(ip, level)

    async def set_mute(self, ip: str, mute: bool) -> bool:
        return (
            await self._get(ip, "/Volume", query=f"mute={1 if mute else 0}", control=True)
        ) is not None

