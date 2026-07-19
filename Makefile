# Bluesound Dashboard — common developer entry points.
# Prefer these targets over ad-hoc uvicorn/vite launches.

.PHONY: help install build run

help:
	@printf '%s\n' \
		'make install  Install backend venv + frontend npm deps' \
		'make build    Build frontend dist; ensure backend package installed' \
		'make run      Start API then UI (waits for /api/v1/healthz before Vite)' \
		'make help     Show this help'

install:
	@./scripts/install

build:
	@./scripts/build

run:
	@./scripts/run
