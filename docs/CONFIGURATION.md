# Configuration

All settings are environment variables with the `BSD_` prefix. Copy [.env.example](../.env.example) to `.env` in the repo root (or export variables in your shell) before starting the backend.

Defaults are tuned for local development: bind localhost, discover via mDNS+LSDP, poll every few seconds, and throttle both outbound BluOS calls and inbound mutating API requests.

BluOS control paths follow Custom Integration API **v1.7** (queue via `/Playlist`, capture inputs via `/Settings?id=capture`, Bluetooth via `/audiomodes`). Device uptime is read from the player web UI on port 80 (`/diagnostics`), not BluOS `:11000`.

## Network exposure

BluOS players have no authentication — each device already exposes control on the LAN (and this dashboard consolidates that). There is nothing extra to configure for device auth.

- **Default (`BSD_HOST=127.0.0.1`):** only this machine can reach the dashboard.
- **LAN bind (`0.0.0.0`):** same practical exposure as opening any player's BluOS UI to the network. Tighten `BSD_CORS_ORIGINS` to your UI origin; set `BSD_ENABLE_OPENAPI=false` if you do not want `/api/docs` on the LAN.
- **Do not** expose the dashboard to the internet.

The backend only talks to discovered private IPs (see `BSD_ALLOW_NON_PRIVATE_IPS`) and caps XML size for malformed device responses.

## Server

| Variable | Default | Purpose |
|----------|---------|---------|
| `BSD_HOST` | `127.0.0.1` | Bind address |
| `BSD_PORT` | `8000` | Bind port |
| `BSD_LOG_LEVEL` | `INFO` | Log level |
| `BSD_CORS_ORIGINS` | `http://localhost:5173` | Allowed CORS origins (comma-separated) |
| `BSD_STATIC_DIR` | *(empty)* | SPA dist directory for single-process serve |
| `BSD_ENABLE_OPENAPI` | auto | OpenAPI/Swagger; auto-off when binding beyond localhost |

## Discovery

| Variable | Default | Purpose |
|----------|---------|---------|
| `BSD_DISCOVERY_METHOD` | `both` | `mdns`, `lsdp`, or `both` (merge) |
| `BSD_DISCOVERY_TIMEOUT` | `5` | Discovery window (seconds) |
| `BSD_DISCOVERY_CACHE_TTL` | `300` | Cache TTL before forced rediscovery |
| `BSD_EMPTY_FLEET_REDISCOVERY_SECONDS` | `30` | Re-scan interval when no players found |
| `BSD_DISCOVERED_GRACE_TTL` | `60` | Control grace after a player drops from discovery |
| `BSD_SSE_KEEPALIVE_SECONDS` | `15` | SSE keepalive interval |
| `BSD_ALLOW_NON_PRIVATE_IPS` | `false` | Escape hatch — allow non-private device IPs (unsafe) |
| `BSD_MDNS_SERVICE` | `_musc._tcp.local.` | mDNS service type |
| `BSD_BLUOS_PORT` | `11000` | BluOS HTTP port |

## Polling and device HTTP

| Variable | Default | Purpose |
|----------|---------|---------|
| `BSD_POLL_INTERVAL` | `3` | Status poll interval |
| `BSD_DEVICE_HTTP_TIMEOUT` | `3` | Per-device HTTP timeout |
| `BSD_MAX_CONCURRENT_DEVICE_CALLS` | `20` | Cap concurrent BluOS HTTP calls |
| `BSD_CONTROL_RATE_LIMIT_SECONDS` | `0.1` | Per **BluOS device IP** spacing for outbound control calls |
| `BSD_API_RATE_LIMIT_SECONDS` | `0.05` | Per **HTTP client IP** spacing for mutating API requests |
| `BSD_CIRCUIT_FAILURE_THRESHOLD` | `5` | Failures before slow-poll |
| `BSD_CIRCUIT_SLOW_POLL_SECONDS` | `15` | Slow-poll interval after circuit open |

## XML hardening

| Variable | Default | Purpose |
|----------|---------|---------|
| `BSD_MAX_XML_SIZE` | `1048576` | Max BluOS XML bytes |
| `BSD_MAX_XML_DEPTH` | `20` | Max XML depth |
| `BSD_MAX_XML_ELEMENTS` | `10000` | Max XML elements |

## Common adjustments

- **Single-process deploy:** build the frontend, then set `BSD_STATIC_DIR` to the `dist` folder — see [RUNBOOK.md](RUNBOOK.md).
- **Discovery trouble:** try `BSD_DISCOVERY_METHOD=lsdp` or increase `BSD_DISCOVERY_TIMEOUT`.
- **Slow VPN/firewall:** increase `BSD_DEVICE_HTTP_TIMEOUT` or `BSD_POLL_INTERVAL`.

## See also

- [RUNBOOK.md](RUNBOOK.md) — start commands, health endpoints, failures, logs
- [SECURITY.md](../SECURITY.md) — vulnerability reporting
- [README.md](../README.md) — project overview
