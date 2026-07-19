# Runbook

## Start (development)

```bash
make run
```

That starts the API, waits for `GET /api/v1/healthz`, then starts the UI (avoids Vite proxying to a dead `:8000`).

Or two terminals (start UI only after healthz returns 200):

```bash
# Terminal 1 — API (Python package lives in backend/)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
# or: bluesound-dashboard

# Terminal 2 — UI
cd frontend
npm ci
npm run dev
```

Open http://127.0.0.1:8765/

## Start (production-ish single process)

```bash
make install
make build
cd backend && BSD_STATIC_DIR=../frontend/dist .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Environment variables: [CONFIGURATION.md](CONFIGURATION.md). Network exposure notes are in that doc's **Network exposure** section.

## Health

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/healthz` | Liveness — process up; `status: degraded` when the poller is stopped |
| `GET /api/v1/readyz` | Readiness — 503 when poller is not running; includes `sse_dropped_events` and subscriber count |
| `GET /api/v1/version` | Release version |
| `GET /health` | Redirects to `/api/v1/healthz` (so SPA catch-all never serves HTML for `/health`) |

## Ports (local)

| Service | URL |
|---------|-----|
| UI (Vite) | http://127.0.0.1:8765/ |
| API | http://127.0.0.1:8000/ |

Vite proxies `/api` → the API. CORS defaults allow both `http://127.0.0.1:8765` and `http://localhost:8765`.

## Common failures

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| Empty fleet | Discovery blocked (VPN/firewall) or no players | Wait for empty-fleet rediscovery (`BSD_EMPTY_FLEET_REDISCOVERY_SECONDS`); Rescan; try `BSD_DISCOVERY_METHOD=lsdp` |
| `device_not_found` on control | Player dropped off discovery (grace expired) | Rescan network; check `BSD_DISCOVERED_GRACE_TTL` |
| One player stuck offline | Circuit slow-poll after failures | Power-cycle player; wait for recovery poll |
| SSE reconnecting / stale UI | Proxy buffering, backend restart, or SSE backpressure | Check backend logs for `sse_drop_subscriber`; REST fallback polls every 5s |
| Vite `ECONNREFUSED` / proxy errors to `:8000` | UI started before API was healthy | Use `make run` (waits for healthz); or start API first and confirm healthz before `npm run dev` |

Variable names and defaults: [CONFIGURATION.md](CONFIGURATION.md).

## Logs

Stdout JSON logs include `request_id`. Every HTTP request (except SSE stream) emits `http_request` with method, path, status, and `duration_ms`. Control paths emit `control_op` / `control_failed` / `control_during_grace` with `op`, `device_id`, and `device_ip`. Fleet-wide actions log per-device results plus `fleet_action_complete`. Correlate UI toast request IDs with log lines.

## See also

- [CONFIGURATION.md](CONFIGURATION.md) — all `BSD_` variables
- [SECURITY.md](../SECURITY.md) — vulnerability reporting
- [README.md](../README.md) — project overview
- [CONTRIBUTING.md](../CONTRIBUTING.md) — setup and checks
