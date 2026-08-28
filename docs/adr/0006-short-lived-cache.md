# ADR-0006 — Short-lived caches

## Status

Accepted.

## Context

Jira reads are slower than local reads and consume API quota. Exact invalidation would require inbound webhooks, which are incompatible with the loopback-only scope.

## Decision

Issues are cached for 60 seconds. Board data, configuration, epics, and metadata are cached for 300 seconds. Known writes invalidate the issue cache, while delta polling handles remaining freshness concerns.

## Alternatives considered

- **Fine-grained invalidation through Jira webhooks** — rejected because Jira would need to reach a local service behind the user's workstation.
- **ETag or `If-Modified-Since` revalidation** — rejected because support and granularity vary across the Jira endpoints in use.

## Consequences

Navigation remains responsive and pressure on Jira stays moderate, at the cost of a short window of potentially stale data. The cache never becomes a source of truth.

## Reconsideration triggers

A deployment reachable by Jira, tighter API quotas, or near-instant consistency requirements.
