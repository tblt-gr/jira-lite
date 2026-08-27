# Contributing to Jira Lite

Thank you for contributing to Jira Lite. Do not report suspected vulnerabilities through public
issues or pull requests; follow the [Security Policy](./SECURITY.md) instead.

## Product boundary

Jira Lite is a fast, local-first, single-user Jira client. Changes should preserve its loopback-only
deployment, focused Jira workflows and low client-side overhead. Authentication, TLS termination
and multi-user deployment require an explicit architecture and security review before implementation.

## Before you start

- Start from an up-to-date `main` branch.
- Use one focused branch per issue, such as `feat/short-description`, `fix/short-description`,
  `docs/short-description` or `chore/short-description`.
- Use the bug or feature issue form when opening an issue. Describe expected behaviour and
  acceptance criteria without exposing Jira URLs, credentials or private issue content.

## Local setup

Jira Lite requires PHP 8.5+, Composer and Node.js. Docker is the simplest way to use the expected
PHP runtime.

```bash
composer install
npm ci
cp .env.example .env.local
```

Set `APP_SECRET`, `JIRA_BASE_URL`, `JIRA_EMAIL` and `JIRA_API_TOKEN` in `.env.local`, then start the
application with one of these commands:

```bash
docker compose up -d
# or
php -S 127.0.0.1:8000 -t public public/index.php
```

Keep the service bound to loopback. Never use real Jira credentials in committed files, fixtures,
logs, screenshots or issue reports.

## Development workflow

- Keep controllers thin and place Jira HTTP behaviour in repositories or application services.
- Put PHP code in `src/`, Twig views in `templates/`, browser modules in `assets/`, and tests in
  `tests/`.
- Preserve responsive, keyboard-accessible interactions and avoid unnecessary browser dependencies.
- Do not commit generated `var/`, `vendor/`, `public/assets/` or `assets/vendor/` content.
- Update documentation, translations and tests with the behaviour they describe.

## Quality gates

Run the complete checks before opening a pull request:

```bash
composer validate --strict
composer check
npm run lint
npm test
```

Also syntax-check each changed PHP file:

```bash
php -l path/to/ChangedFile.php
```

Manually exercise affected pages and `/api/jira` routes against a test Jira instance when
applicable. Visual changes should be checked in both supported languages and at narrow and wide
viewport sizes.

## Code style

- Follow `.editorconfig`: UTF-8, LF, four-space indentation, final newlines and no trailing
  whitespace.
- PHP follows PSR-4 under `App\`, with strict types where practical, `PascalCase` classes and
  `camelCase` methods and variables. Match existing final classes and constructor promotion.
- JavaScript uses ES modules, `camelCase` exports and semicolons.
- CSS classes use kebab-case.
- PHPUnit tests use the `App\Tests\` namespace and `*Test.php` filenames.
- All user-facing text must use the Symfony/Twig or frontend translation catalog. Keep French and
  English catalogs aligned.

Use semantic HTML for controls, provide accessible names, support keyboard navigation, maintain
visible focus and restore focus after dialogs close. Text should meet a minimum 4.5:1 contrast
ratio.

## Commits

Use short, imperative [Conventional Commit](https://www.conventionalcommits.org/) messages in
English. For example:

```text
feat: add an issue filter
fix: handle empty Jira comments
test: cover media redirects
docs: clarify local setup
```

## Pull requests

- Target `main` and keep one coherent change per pull request.
- Use a Conventional Commit title and link the related issue.
- Complete `.github/PULL_REQUEST_TEMPLATE.md` with the user-visible outcome and verification run.
- Include screenshots for board, dialog or theme changes.
- Resolve review comments and keep the branch current before merge.

## Releases

Releases are created from a clean commit on `main` after the `CI gate` succeeds. The version in
`package.json` and the annotated tag must match exactly, using `vMAJOR.MINOR.PATCH`. Pushing a valid
tag triggers `.github/workflows/release.yml`, which verifies the source commit and publishes the
GitHub release. Never move or reuse a published tag.
