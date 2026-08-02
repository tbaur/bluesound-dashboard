# Configuration

All settings are environment variables with the `BSD_` prefix. Copy [.env.example](../.env.example) to `.env` in the **repo root** (or export variables in your shell) before starting the backend. The settings loader resolves the repo-root `.env` even when uvicorn is started from `backend/` (cwd-relative `.env` is also accepted as a fallback).

Defaults are tuned for local development: bind localhost, discover via mDNS+LSDP, poll every few seconds, and throttle both outbound BluOS calls and inbound mutating API requests (plus expensive GETs such as `/api/v1/fleet/upgrades`).

Local UI is Vite on **port 8765** (`make run` / `frontend` `npm run dev`). CORS defaults match that origin. The API defaults to **port 8000**.

BluOS control paths follow Custom Integration API **v1.7** (queue via `/Playlist`, capture inputs via `/Settings?id=capture`, Bluetooth via `/audiomodes`, audio/player settings via `/Settings?id=audio|player`). Device diagnostics and upgrade checks use the player web UI on port 80 (`/diagnostics`, `/upgrade`). Setting writes use the reverse-engineered web UI `POST /settings` form (same path as the native control panel).

## Network exposure

BluOS players have no authentication — each device already exposes control on the LAN (and this dashboard consolidates that). There is nothing extra to configure for device auth.

- **Default (`BSD_HOST=127.0.0.1`):** only this machine can reach the dashboard.
- **LAN bind (`0.0.0.0`):** same practical exposure as opening any player's BluOS UI to the network. Set `BSD_API_TOKEN` so API calls require a Bearer token; put the matching value in `frontend/.env` as `VITE_API_TOKEN` (Vite does not read the repo-root `.env`); tighten `BSD_CORS_ORIGINS`; set `BSD_ENABLE_OPENAPI=false` if you do not want `/api/docs` on the LAN.
- **Do not** expose the dashboard to the internet.

The backend only talks to discovered private IPs (see `BSD_ALLOW_NON_PRIVATE_IPS`) and caps XML size for malformed device responses.

## Server

| Variable | Default | Purpose |
|----------|---------|---------|
| `BSD_HOST` | `127.0.0.1` | Bind address |
| `BSD_PORT` | `8000` | Bind port |
| `BSD_LOG_LEVEL` | `INFO` | Log level |
| `BSD_CORS_ORIGINS` | `http://127.0.0.1:8765,http://localhost:8765` | Allowed CORS origins (comma-separated) |
| `BSD_API_TOKEN` | *(empty)* | When set, require `Authorization: Bearer …` or `X-API-Token` for `/api/v1/*` (health/ready/version exempt; SSE may use `?token=`). Pair with `VITE_API_TOKEN` in `frontend/.env` |
| `BSD_TRUSTED_PROXIES` | *(empty)* | Comma-separated peer IPs allowed to supply `X-Forwarded-For` for API rate-limit keys |
| `BSD_STATIC_DIR` | *(empty)* | SPA dist directory for single-process serve (path relative to uvicorn cwd) |
| `BSD_ENABLE_OPENAPI` | auto | OpenAPI/Swagger; auto-off when binding beyond localhost |

## Discovery

| Variable | Default | Purpose |
|----------|---------|---------|
| `BSD_DISCOVERY_METHOD` | `both` | `mdns`, `lsdp`, or `both` (merge) |
| `BSD_DISCOVERY_TIMEOUT` | `5` | Discovery window (seconds) |
| `BSD_DISCOVERY_CACHE_TTL` | `300` | Cache TTL for **non-empty** discovery results |
| `BSD_EMPTY_FLEET_REDISCOVERY_SECONDS` | `30` | Cache/re-scan interval when the fleet is empty (API + poller; avoids mDNS storms) |
| `BSD_DISCOVERED_GRACE_TTL` | `60` | Control grace after a player drops from discovery |
| `BSD_SSE_KEEPALIVE_SECONDS` | `15` | SSE keepalive interval |
| `BSD_SSE_QUEUE_SIZE` | `32` | Per-subscriber SSE queue size (drop-oldest under backpressure) |
| `BSD_ALLOW_NON_PRIVATE_IPS` | `false` | Escape hatch — allow non-private device IPs (unsafe) |
| `BSD_MDNS_SERVICE` | `_musc._tcp.local.` | Deprecated — ignored; mDNS always browses `_musc` + `_musp` |
| `BSD_BLUOS_PORT` | `11000` | Default BluOS HTTP port (CI secondary zones use SRV ports, e.g. `11010+`) |
| `BSD_WEB_UI_PORT` | `80` | Device web UI port (diagnostics, upgrade, setting writes) |

mDNS discovers primary players (`_musc._tcp.local.`) and CI secondary zones (`_musp._tcp.local.`, e.g. NAD CI S2). Players are keyed as canonical `ip:port`. LSDP discovers chassis IPs only (normalized to `ip:11000`); secondary zones require mDNS. Only endpoints that answer `/SyncStatus` are kept in the fleet.

### Multi-zone and volume UI

NAD CI multi-zone chassis expose each zone as its own BluOS endpoint (often `:11010`, `:11011`, …). The fleet UI shows zone numbers next to the model name. **Global volume** applies only to residential Bluesound players; **CI S2 volume** applies only to CI S2 zones — do not expect one slider to match both product lines.

### Sync / orphan groups

`POST /api/v1/sync/enable` groups **free (standalone) rooms only** under the chosen primary — it never pulls followers out of existing groups. `POST /api/v1/sync/break` and `POST /api/v1/sync/remove` dissolve runtime groups; break returns per-link succeeded/failed counts (502 only when every link fails). When the primary has left discovery, secondaries that still report a master are surfaced as orphan groups (Sync panel lead name **Offline primary**, role chip `offline`). Break/remove then use reparent-ungroup against **other free/standalone** online endpoints (never members of another group). See [RUNBOOK.md](RUNBOOK.md) **Multi-room sync notes**.

### Bluetooth

`GET /api/v1/devices/{id}/bluetooth` returns `supported: false` when the model is known-unsupported, the capture probe reports no Bluetooth, **or the probe hard-fails** — not a 502. `POST` to set a mode returns **404** `bluetooth_unsupported` in those same cases (including probe hard-fail). The player detail UI hides the Bluetooth section when unsupported.

## Polling and device HTTP

| Variable | Default | Purpose |
|----------|---------|---------|
| `BSD_POLL_INTERVAL` | `3` | Status poll interval |
| `BSD_DEVICE_HTTP_TIMEOUT` | `3` | Per-device HTTP timeout |
| `BSD_MAX_CONCURRENT_DEVICE_CALLS` | `20` | Cap concurrent BluOS HTTP calls |
| `BSD_CONTROL_RATE_LIMIT_SECONDS` | `0.1` | Per **device endpoint** (`ip:port`) spacing for outbound BluOS control and web-UI writes |
| `BSD_API_RATE_LIMIT_SECONDS` | `0.05` | Per **HTTP client IP** spacing for mutating API requests and expensive GETs (`/api/v1/fleet/upgrades`). Behind a reverse proxy, set `BSD_TRUSTED_PROXIES` so `X-Forwarded-For` is honored |
| `BSD_CIRCUIT_FAILURE_THRESHOLD` | `5` | Failures before slow-poll |
| `BSD_CIRCUIT_SLOW_POLL_SECONDS` | `15` | Slow-poll interval after circuit open |
| `BSD_FLEET_UPGRADES_CACHE_SECONDS` | `30` | Cache TTL for `GET /api/v1/fleet/upgrades` |

## XML hardening

| Variable | Default | Purpose |
|----------|---------|---------|
| `BSD_MAX_XML_SIZE` | `1048576` | Max BluOS XML bytes |
| `BSD_MAX_XML_DEPTH` | `20` | Max XML depth |
| `BSD_MAX_XML_ELEMENTS` | `10000` | Max XML elements |

## Common adjustments

- **Single-process deploy:** `make build`, then from `backend/` set `BSD_STATIC_DIR=../frontend/dist` (path is relative to the uvicorn working directory) — see [RUNBOOK.md](RUNBOOK.md).
- **Discovery trouble:** try `BSD_DISCOVERY_METHOD=lsdp` or increase `BSD_DISCOVERY_TIMEOUT`.
- **Slow VPN/firewall:** increase `BSD_DEVICE_HTTP_TIMEOUT` or `BSD_POLL_INTERVAL`.

## See also

- [RUNBOOK.md](RUNBOOK.md) — start commands, health endpoints, failures, logs
- [SECURITY.md](../SECURITY.md) — vulnerability reporting
- [README.md](../README.md) — project overview
