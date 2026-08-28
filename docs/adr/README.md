# Architecture decision log

These ADRs document Jira Lite's structural decisions. Once accepted, they are immutable: a superseded decision remains in the index and links to its replacement.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](./0001-local-only-application.md) | Local-only application | Accepted |
| [0002](./0002-no-application-authentication.md) | No application-level authentication | Accepted |
| [0003](./0003-no-local-database.md) | Jira as the source of truth, without a local database | Accepted |
| [0004](./0004-no-spa-framework.md) | ES modules, AssetMapper, and Stimulus without an SPA | Accepted |
| [0005](./0005-server-side-media-proxy.md) | Server-side media proxy | Accepted |
| [0006](./0006-short-lived-cache.md) | Short-lived caches | Accepted |
| [0007](./0007-delta-polling.md) | Delta polling | Accepted |
| [0008](./0008-single-jira-identity.md) | Single server-side Jira identity | Accepted |

New decisions should start from [template.md](./template.md) and use the next available number.
