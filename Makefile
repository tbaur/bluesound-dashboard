# Bluesound Dashboard — common developer entry points.
# Prefer these targets over ad-hoc uvicorn/vite launches.

.PHONY: help run

help:
	@printf '%s\n' \
		'make run   Start API then UI (waits for /api/v1/healthz before Vite)' \
		'make help  Show this help'

run:
	@./scripts/run
