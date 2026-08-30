# Security and privacy model

## Intended deployment

Orchestrator is designed for one operator on a trusted host. It binds to `127.0.0.1` by default. Remote access should terminate HTTPS through Tailscale Serve or a comparably authenticated private proxy.

The application enforces its own passphrase session even inside a tailnet. Treat the host account, database, encryption key, and connected runtime credentials as one security boundary.

## Controls

- First-run passphrase hashed with scrypt (`N=32768`, `r=8`, `p=1`)
- 256-bit random HttpOnly session cookies, SameSite Strict, 30-day expiry
- Separate CSRF token required for every mutating browser request
- Explicit browser-origin allowlist
- Global and route-specific rate limits
- Content Security Policy, anti-framing, MIME sniffing, and referrer controls
- AES-256-GCM authenticated encryption for connector configuration and messages
- Random local master key created with owner-only mode when running on loopback
- Mandatory supplied master key when binding beyond loopback
- Hashed ingest keys that are displayed only once
- Bounded request bodies and adapter outputs
- Audit rows for authentication and mutations
- Secrets omitted from API responses and sanitized from adapter error strings
- Demo authentication bypass refused outside loopback
- No analytics or telemetry

## Data that remains plaintext

Events, metrics, layouts, project summaries, attention items, audit metadata, and the opt-in full-text knowledge index are plaintext inside SQLite. Use full-disk encryption and appropriate host access controls. Do not index a directory whose contents should not be copied into the portal data directory.

## Threats outside the first-release boundary

- A compromised host user can read process memory and control the portal.
- A malicious administrator can configure a webhook that reaches services visible to the host.
- Browser extensions with page access may observe rendered content.
- One server process and SQLite data directory are not a horizontal multi-tenant design.
- Orchestrator does not authorize irreversible actions on behalf of a runtime. The runtime must retain those gates.

Do not open public issues for suspected vulnerabilities. Follow [SECURITY.md](../SECURITY.md) and never include real connector secrets or private assistant data.
