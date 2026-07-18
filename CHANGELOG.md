# Changelog

All notable changes to this project are documented in this file.

## [0.5.0](https://github.com/tbaur/bluesound-dashboard/compare/v0.4.2...v0.5.0) (2026-07-18)


### Features

* add API home page and unblock Swagger docs ([#28](https://github.com/tbaur/bluesound-dashboard/issues/28)) ([af58778](https://github.com/tbaur/bluesound-dashboard/commit/af5877874054a9c965c15f2686cb895f0724b5bf))

## [0.4.2](https://github.com/tbaur/bluesound-dashboard/compare/v0.4.1...v0.4.2) (2026-07-13)


### Bug Fixes

* harden redirect SSRF, CSP, discovery locking, and local start ([#26](https://github.com/tbaur/bluesound-dashboard/issues/26)) ([ced834b](https://github.com/tbaur/bluesound-dashboard/commit/ced834b1fc86e15e9991ca16c0c42c0c444e0b75))

## [0.4.1](https://github.com/tbaur/bluesound-dashboard/compare/v0.4.0...v0.4.1) (2026-07-13)


### Bug Fixes

* **ui:** collapse House firmware/rooms into a single Devices list ([#24](https://github.com/tbaur/bluesound-dashboard/issues/24)) ([97d7a21](https://github.com/tbaur/bluesound-dashboard/commit/97d7a21ab9c0157bb55ad9994d5814d8e28ca3eb))

## [0.4.0](https://github.com/tbaur/bluesound-dashboard/compare/v0.3.0...v0.4.0) (2026-07-13)


### Features

* add House page, player settings, and firmware tools ([#22](https://github.com/tbaur/bluesound-dashboard/issues/22)) ([7185400](https://github.com/tbaur/bluesound-dashboard/commit/71854003beb61fc12e0d71609dab980237563fd3))

## [0.3.0](https://github.com/tbaur/bluesound-dashboard/compare/v0.2.1...v0.3.0) (2026-07-13)


### Features

* **ui:** redesign player detail and align BluOS API to v1.7 ([#19](https://github.com/tbaur/bluesound-dashboard/issues/19)) ([292cc3a](https://github.com/tbaur/bluesound-dashboard/commit/292cc3acadfd82c17b7b11be72032bf1abce10b8))

## [0.2.1](https://github.com/tbaur/bluesound-dashboard/compare/v0.2.0...v0.2.1) (2026-07-12)


### Bug Fixes

* **frontend:** drop deprecated baseUrl from tsconfig ([#16](https://github.com/tbaur/bluesound-dashboard/issues/16)) ([0d64025](https://github.com/tbaur/bluesound-dashboard/commit/0d64025f74ae5718883232411a5803897b16a92a))


### Documentation

* tighten README and CONTRIBUTING for new users ([#18](https://github.com/tbaur/bluesound-dashboard/issues/18)) ([0994ce1](https://github.com/tbaur/bluesound-dashboard/commit/0994ce1a8413ff8499b66af151c0cb997569bf3e))

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
