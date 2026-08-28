# ADR-0005 — Server-side media proxy

## Status

Accepted.

## Context

Jira avatars and attachments may require API credentials. Sending those credentials to the browser would expose the token, while a generic proxy would introduce an SSRF risk.

## Decision

Jira Lite fetches media through a server-side proxy restricted to allowed Jira hosts. Every redirect is revalidated, response sizes and MIME types are bounded, and confinement headers are added to responses.

## Alternatives considered

- **Direct download with Atlassian cookies or tokens** — rejected because it would expose secrets to the browser and complicate CORS.
- **Temporary signed URLs** — rejected because Jira Cloud does not provide a uniform mechanism suitable for every media type used here.

## Consequences

The browser never learns the Jira token and uses one consistent local URL format. The server handles media traffic and must preserve strict SSRF controls and response limits.

## Reconsideration triggers

Native Jira support for signed URLs, direct browser OAuth, or media volume incompatible with a local proxy.
