# Changelog

All notable changes to this project are documented in this file.

## [0.2.0](https://github.com/tbaur/bluesound-dashboard/compare/v0.1.0...v0.2.0) (2026-07-12)


### Features

* initial bluesound-dashboard v0.1.0 ([beb9fe0](https://github.com/tbaur/bluesound-dashboard/commit/beb9fe03fbea8d1a310510334c9ccf60503ce137))


### Bug Fixes

* **ci:** pin GitHub Actions to resolvable SHAs ([88f1e8c](https://github.com/tbaur/bluesound-dashboard/commit/88f1e8c26ac9268307daac23175e60f56040ad58))
* **deps:** align Dependabot with sibling repos and migrate majors ([1014048](https://github.com/tbaur/bluesound-dashboard/commit/1014048b449d2a450608023743e697a18fa4b20b))

## [0.1.0](https://github.com/tbaur/bluesound-dashboard/releases/tag/v0.1.0) (2026-07-12)

### Added

- LAN dashboard with mDNS+LSDP discovery, SSE live fleet, multi-room groups, and bluesound-controller parity APIs (toggle, relative volume, diagnose, reboot, sync enable).

### Fixed

- Discovery grace TTL now retains device IPs for controls after a player drops from scan.
- `sync/break` no longer stops primaries when all slave removals fail; parallel unlink per group.
- API-side rate limiting, fleet/sync control logging, healthz degraded status, SSE drop warnings, OpenAPI gated off LAN binds.
