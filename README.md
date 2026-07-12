# Bluesound Dashboard

Consolidated LAN dashboard for Bluesound / BluOS players. Discovers devices on the network (mDNS + LSDP), and exposes the core [bluesound-controller](https://github.com/tbaur/bluesound-controller) control surface through a live web UI.

## Features

- **Discovery** on page load, on demand, and automatic re-scan when the fleet is empty
- **Live fleet** via server-side poller + SSE (REST fallback every 5s when SSE reconnects)
- **Playback** play / pause / stop / skip / back / toggle
- **Volume** absolute level, relative adjust (+/− delta), mute (per-player and house-wide)
- **Queue** view / clear / reorder
- **Inputs**, **presets**, **Bluetooth** modes
- **Multi-room groups** link rooms, add/remove followers, group-all (`sync enable`), ungroup all
- **Diagnostics** per-player status + uptime; hard/soft reboot
- **Ops** `healthz` (degraded when poller stopped), `readyz`, structured logs, release-please releases

### [bluesound-controller](https://github.com/tbaur/bluesound-controller) parity

| Capability | Controller CLI | Dashboard API | Dashboard UI |
|------------|----------------|---------------|--------------|
| play / pause / stop / skip / back | yes | yes | yes |
| toggle | yes | yes | yes (detail play button) |
| absolute volume | yes | yes | yes |
| relative volume (+/−) | yes | yes | via API (`/volume/adjust`) |
| mute / fleet mute | yes | yes | yes |
| queue / inputs / presets / bluetooth | yes | yes | yes (detail page) |
| multi-room add/remove/break | yes | yes | yes (fleet sync panel + detail leave) |
| sync enable (group all) | yes | yes | via API (`/sync/enable`) |
| diagnose | yes | yes | via API (`/diagnose`) |
| reboot / soft reboot | yes | yes | via API (`/reboot`) |

## Quick start

```bash
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]" && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

cd frontend && npm ci && npm run dev
```

Open http://localhost:5173/

Production deploy, health checks, and troubleshooting: [docs/RUNBOOK.md](docs/RUNBOOK.md).

Configuration and network exposure: [docs/CONFIGURATION.md](docs/CONFIGURATION.md) (copy [.env.example](.env.example) to start).

## Docs

- [Configuration](docs/CONFIGURATION.md) — environment variables and network exposure
- [Runbook](docs/RUNBOOK.md) — start, health, failures, logs
- [Security](SECURITY.md) — vulnerability reporting
- [Releasing](RELEASING.md)
- [Contributing](CONTRIBUTING.md)

## License

Copyright 2026 tbaur. Apache License 2.0. See [LICENSE](LICENSE).
