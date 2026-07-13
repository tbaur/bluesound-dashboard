# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.3.x   | ✅ Active support |
| < 0.3   | ❌ No longer supported |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public issue**
2. Use GitHub's private vulnerability reporting (Security tab), or contact the maintainer directly
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes

## Context

BluOS players have no authentication — each device already exposes control on the LAN. This dashboard consolidates that surface. Operational guidance (bind address, CORS, OpenAPI) lives in [docs/CONFIGURATION.md](docs/CONFIGURATION.md) under **Network exposure**.

## Security Measures

The backend applies:

- Discovered-device targeting with a short grace TTL
- Private IPv4 gate on BluOS calls (unless explicitly overridden)
- Per-device and per-client rate limiting
- XML size/depth/element caps
- Pydantic input validation and HTTP security headers
- Dependency auditing via Dependabot (npm, pip, GitHub Actions), CodeQL, and `npm audit` in CI

Details and variable names: [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

## Best Practices for Users

1. Keep dependencies updated
2. Do not commit `.env` files
3. Do not expose the dashboard to the internet

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix timeline**: Depends on severity
  - Critical: 24–48 hours
  - High: 1 week
  - Medium: 2 weeks
  - Low: Next release

---

*Last updated: 2026-07-12*
