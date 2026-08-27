# Security Policy

## Supported versions

Security fixes are provided for the latest released version of Jira Lite. Unreleased commits on
`main` are not supported for production use.

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Older releases | No |

Before reporting a vulnerability, confirm that it still affects the latest release.

## Reporting a vulnerability

Do not disclose suspected vulnerabilities in a public issue, pull request or discussion.

Use the **Report a vulnerability** button in the repository's Security tab when available. If
private vulnerability reporting is unavailable, open a discussion containing only a request for a
private contact channel and tag [@tblt-gr](https://github.com/tblt-gr). Do not include vulnerability
details in that public request.

Include the following information in the private report when possible:

- The affected version or commit.
- The deployment method and relevant configuration, with secrets removed.
- The impact and conditions required for exploitation.
- Reproduction steps or a minimal proof of concept.
- Any suggested mitigation or remediation.

You should receive an acknowledgement within seven days. The maintainer will validate the report,
coordinate a fix and release when necessary, and agree on disclosure timing with the reporter.

## System and scope

Jira Lite is a local, single-user interface to Jira Cloud. It has no database and uses one
server-side Jira identity for all operations. The browser talks to the Symfony application over
loopback; the application talks to Jira Cloud over HTTPS and keeps Jira credentials server-side.

This policy covers the Symfony backend, browser assets, Twig templates, Docker configuration,
CI/release workflows and the Jira integration. Jira Cloud itself, the operating system and the
browser are external dependencies.

See [ADR-0002](docs/adr/0002-no-application-authentication.md) for the intentional decision not to
add application authentication while Jira Lite remains loopback-only.

## Threat model and trust boundaries

The local OS account and explicitly configured Jira instance are trusted. Attacker-controlled input
includes requests from malicious websites, route and JSON parameters, Jira issue content, Atlassian
media URLs and upstream HTTP responses.

The assets at risk are the Jira API token, private Jira data, the integrity of Jira issues and
worklogs, and the availability of the local application. The important boundaries are:

- Browser to local Symfony application.
- Symfony application to Jira Cloud and approved Atlassian media hosts.
- Environment secrets and logs to browser-visible responses or committed files.

## Security invariants

The following properties must continue to hold:

- Default development and production configurations bind only to loopback, and `TRUSTED_HOSTS`
  rejects unapproved hostnames to limit DNS-rebinding attacks.
- Every mutating `/api/jira` route requires a valid stateless `jira_api` CSRF token and JSON content
  type. Read and write routes remain rate-limited.
- Jira credentials stay server-side, are never returned to the browser, and are redacted from logs.
- Jira and user-controlled text is rendered as text or through bounded rich-text handling; it must
  not become executable HTML or script.
- HTML responses retain a restrictive Content Security Policy and the existing anti-framing,
  content-type, referrer and permissions headers.
- `App\Jira\JiraMediaProxy` only fetches the configured Jira origin or explicitly approved HTTPS
  media hosts, validates every redirect, sends Jira credentials only to the exact Jira origin, and
  enforces response size and image content-type limits.
- Secrets, `.env.local`, production Jira data and generated runtime artifacts are never committed.

## Reportable findings and severity context

A finding is reportable when it is realistically reachable in the documented default local
deployment or breaks a security invariant. Examples include:

- Cross-site Jira mutations, DNS-rebinding bypasses or unintended non-loopback exposure.
- Disclosure of Jira credentials or private Jira data to browser code, logs or unauthorised hosts.
- Server-side request forgery, unsafe redirect handling or credential forwarding in the media proxy.
- Cross-site scripting or execution of Jira-controlled content.
- A bypass of request validation, security headers or rate limits with meaningful confidentiality,
  integrity or availability impact.

Severity should reflect the Jira permissions of the configured account, whether the default
configuration is affected, the interaction required, and whether compromise crosses from a website
or Jira-controlled value into local application or Jira access.

## Out of scope and accepted risks

Application authentication, TLS termination, user isolation and per-user Jira attribution are not
provided in the supported loopback-only, single-user model. Reports whose only premise is an
operator explicitly binding the unauthenticated service beyond loopback are out of scope; a bypass
that causes non-loopback exposure under the documented defaults remains in scope.

Regular bugs without a security impact, vulnerabilities affecting only unsupported releases, and
issues solely in Jira Cloud, the browser or the operating system should be reported to the relevant
project instead.

## Known limitations and compensating controls

- Anyone able to use the local OS account and browser can act with the configured Jira identity.
- The application does not provide authentication or TLS; loopback binding and the OS account are
  the access boundary.
- The configured Jira account determines the maximum Jira data and operations exposed by a
  compromise. Use a dedicated account with the least permissions needed when practical.
- Exposing Jira Lite on a shared host or network requires authentication, TLS, authorization and a
  renewed threat-model review before deployment.

## Responsible testing

Test only systems and data you own or have explicit permission to test. Do not perform
denial-of-service testing, access other people's Jira data, degrade shared services or use social
engineering. Remove credentials and private Jira content from all reports and proofs of concept.
