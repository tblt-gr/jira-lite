# ADR-0004 — No SPA framework or frontend build

## Status

Accepted.

## Context

The interface contains an interactive board but remains a small set of Symfony-rendered pages. Fast loading and simple installation matter more than a complete frontend ecosystem.

## Decision

The browser runs native ES modules served through AssetMapper and importmap. Stimulus manages behavior mounting and teardown. Node.js is required only for quality checks and tests, not for producing runtime assets.

## Alternatives considered

- **React or Vue with Vite** — rejected because a component runtime and permanent build pipeline would be disproportionate to the product scope.
- **Turbo** — rejected because the main interactions live in a client-side board and would gain little from server-rendered fragment replacement.

## Consequences

Deployment does not depend on a Node bundle, and client overhead remains low. Modules must retain explicit boundaries and manage their DOM lifecycle directly.

## Reconsideration triggers

Many more highly interactive screens, offline rendering requirements, or state complexity that the current modules can no longer isolate cleanly.
