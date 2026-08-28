# ADR-0008 — Single server-side Jira identity

## Status

Accepted.

## Context

Jira Lite is configured locally with a Jira email address and API token. Without application-level authentication or per-user sessions, every outgoing request shares this identity.

## Decision

One server-side Jira identity performs every read and write. This constraint is visible in the documentation and is an accepted consequence of the single-user scope.

## Alternatives considered

- **Atlassian OAuth 3LO per user** — rejected for now because it requires sessions, token refresh, and per-user cache isolation; see [ADR-0002](./0002-no-application-authentication.md).
- **Multiple selectable static tokens** — rejected because local selection would provide neither reliable authentication nor safe data separation.

## Consequences

Comments, worklogs, and transitions are attributed to the configured account. Users must configure a personal account and protect its token in `.env.local`; the product is unsuitable for a workstation shared by people with distinct Jira identities.

## Reconsideration triggers

Multi-user operation, required individual attribution, a shared workstation, or adoption of Atlassian OAuth 3LO.
