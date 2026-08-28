# ADR-0007 — Delta polling

## Status

Accepted.

## Context

The board must reflect Jira changes without reloading the page. The local service cannot be reached by Jira and has no persistent messaging infrastructure.

## Decision

Every 30 seconds, the frontend requests `/changes?since=...`. The backend fetches only changes made after the supplied cursor, and the client merges the delta while protecting in-flight optimistic updates.

## Alternatives considered

- **WebSocket or Mercure** — rejected because it would add a real-time server without solving how events arrive from Jira.
- **Server-Sent Events** — rejected because a long-lived local connection provides little benefit without inbound Jira webhooks and complicates lifecycle management.

## Consequences

The mechanism works behind loopback and naturally recovers from transient errors. A remote change may remain invisible until the next interval, and each browser tab performs its own requests.

## Reconsideration triggers

Centralized deployment, available Jira webhooks, sub-second latency requirements, or many concurrent browser tabs.
