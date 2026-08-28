# ADR-0001 — Local-only application

## Status

Accepted.

## Context

Jira Lite speeds up common Jira operations from a single person's workstation. A local service is still exposed to three relevant threats: CSRF from another browser tab, DNS rebinding, and accidental publication on the LAN.

## Decision

The application listens on `127.0.0.1` by default and remains a local tool. TLS, reverse proxies, high availability, and Internet exposure are out of scope. Loopback binding, trusted hosts, and CSRF protection are part of the product scope.

## Alternatives considered

- **Multi-tenant SaaS** — rejected because it would require tenant isolation, persistent storage, authorization, and operation of a public service.
- **Internal deployment behind SSO** — rejected because it would turn the product into a managed platform tied to an organization's infrastructure.

## Consequences

Setup remains lightweight and Jira secrets never leave the workstation. Publishing on a non-loopback network interface violates this architecture and requires, at minimum, authentication, TLS, and a reverse proxy.

## Reconsideration triggers

Shared use, remote access, centralized deployment, or a requirement for continuous availability.
