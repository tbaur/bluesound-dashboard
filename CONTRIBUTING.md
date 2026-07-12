# Contributing

## Development

1. Use Conventional Commit PR titles (`feat:`, `fix:`, …) — see [RELEASING.md](RELEASING.md).
2. Run backend checks: `cd backend && pip install -e ".[dev]" && ruff check app tests && mypy app && pytest`
3. Run frontend checks: `cd frontend && npm ci && npm run lint && npm test && npm run typecheck`
4. Prefer small, reviewable PRs with tests for new behavior.

Docs: [README.md](README.md) · [CONFIGURATION.md](docs/CONFIGURATION.md) · [RUNBOOK.md](docs/RUNBOOK.md) · [SECURITY.md](SECURITY.md)

## Code standards

- Validate all external input at API boundaries.
- Keep BluOS protocol knowledge in `backend/app/bluos/`.
- Do not hardcode device IPs.
- Do not log secrets or full BluOS payloads.
