# Security policy

## Supported scope

Jira Lite is designed as a local, single-user tool. It binds to loopback by default and uses one server-side Jira identity. See [ADR-0002](docs/adr/0002-no-application-authentication.md) for that intentional boundary.

## Local threat model

Three risks remain meaningful even for a service running on a workstation:

| Risk | Mitigation |
|---|---|
| A malicious site triggers a Jira write from another browser tab (CSRF). | Mutating `/api/jira` routes require Symfony's stateless `jira_api` CSRF token and JSON content type. |
| DNS rebinding turns a browser request into a request to the local service. | Symfony `TRUSTED_HOSTS` only accepts explicitly configured loopback hosts. |
| The service is accidentally reachable on a local network. | Docker publishes only `127.0.0.1` by default; changing `BIND_ADDRESS` is unsafe without further controls. |

Application authentication, TLS termination and multi-user authorization are out of scope because the application is local-only. If it is exposed beyond the workstation, add authentication, TLS and a reverse proxy before doing so.

## Sensitive component

`App\Jira\JiraMediaProxy` retrieves Jira attachments and remote media for the browser. It validates Jira-origin URLs, limits response size and content types, and must remain SSRF-aware. Changes to this component require dedicated security tests.

## Reporting a vulnerability

Please report vulnerabilities privately to the repository maintainers rather than opening a public issue. Include reproduction steps, affected version or commit, impact, and any suggested remediation. Do not include Jira credentials or production data.
