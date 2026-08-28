# ADR-0002 — No application-level authentication

## Status

Accepted.

## Context

The local threat model retains three attack vectors: CSRF from another browser tab, DNS rebinding, and accidental LAN exposure. The workstation and OS session already form the access boundary for this single-user tool.

## Decision

The OS is the access boundary; Jira Lite does not add a login. CSRF protects write operations, `trusted_hosts` restricts accepted hosts, and loopback binding restricts network access.

## Alternatives considered

- **`InMemoryUser` form login** — rejected because it introduces a second local secret without isolating multiple Jira identities.
- **Atlassian OAuth 3LO** — rejected for the current scope because it requires sessions, token refresh, and per-user cache isolation.

## Consequences

The application uses one Jira identity. Write operations remain protected by CSRF, hosts by `trusted_hosts`, and network access by loopback binding. Actions appear in Jira under the configured server-side identity.

## Reconsideration triggers

Exposure beyond loopback, a shared workstation, distinct Jira permissions, a requirement for individual action attribution, or adoption of Atlassian OAuth 3LO.
