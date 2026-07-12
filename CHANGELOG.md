# Changelog

All notable changes to this project are documented in this file.

## [0.1.0](https://github.com/tbaur/bluesound-dashboard/releases/tag/v0.1.0) (2026-07-12)

### Added

- LAN dashboard with mDNS+LSDP discovery, SSE live fleet, multi-room groups, and bluesound-controller parity APIs (toggle, relative volume, diagnose, reboot, sync enable).

### Fixed

- Discovery grace TTL now retains device IPs for controls after a player drops from scan.
- `sync/break` no longer stops primaries when all slave removals fail; parallel unlink per group.
- API-side rate limiting, fleet/sync control logging, healthz degraded status, SSE drop warnings, OpenAPI gated off LAN binds.
