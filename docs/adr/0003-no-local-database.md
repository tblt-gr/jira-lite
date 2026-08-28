# ADR-0003 — No local database

## Status

Accepted.

## Context

Issues, users, workflows, and comments already belong to Jira. Duplicating this data would introduce synchronization problems and a new backup responsibility for a local tool.

## Decision

Jira remains the source of truth. Jira Lite has no persistent domain model; its server-side state is limited to Symfony's short-lived cache, while non-sensitive UI state may use browser storage.

## Alternatives considered

- **SQLite as a persistent cache** — rejected because freshness management, migrations, and cleanup would outweigh the expected benefit.
- **Doctrine with a mirrored Jira model** — rejected because synchronization conflicts and duplication of Jira's schema would substantially increase complexity.

## Consequences

Installation requires no data service, and losing the cache has no functional impact. In return, Jira must be reachable and initial views depend on its latency.

## Reconsideration triggers

Offline operation, local analytics history, queued writes, or data owned specifically by Jira Lite.
