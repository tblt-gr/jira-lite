# Repository Guidelines

## Project Structure & Module Organization

This project provides a fast, lightweight **local** interface for common Jira workflows, avoiding the cost of loading Jira's full UI. Favor responsiveness, focused features, and minimal client-side overhead over feature parity with Jira. It is designed to remain loopback-only; authentication, TLS, and multi-user deployment are outside its current scope.

This is a Symfony 7.4 application targeting PHP 8.5+. Backend code lives in `src/`: controllers expose page and `/api/jira` routes, while Jira repositories and application services contain Jira integration logic. Twig views are in `templates/`; configuration and dependency wiring are under `config/`. Browser code is organized as ES modules in `assets/`, with Stimulus controllers in `assets/controllers/`, board modules in `assets/board/`, and styles in `assets/styles/`. Public entry points and static images belong in `public/`. Keep generated `var/`, `vendor/`, `public/assets/`, and `assets/vendor/` content out of commits.

## Build, Test, and Development Commands

- `composer install` installs PHP dependencies and runs Symfony asset/import-map setup.
- `cp .env.example .env.local` creates local configuration; replace the Jira URL, email, token, and app secret.
- `php -S 127.0.0.1:8000 -t public public/index.php` runs the app locally with PHP's built-in server.
- `php bin/console cache:clear` rebuilds the Symfony cache after configuration changes.
- `php bin/console debug:router` lists routes and helps verify controller changes.
- `composer validate --strict` checks `composer.json` and lock-file consistency.

## Coding Style & Naming Conventions

Follow `.editorconfig`: UTF-8, LF line endings, four-space indentation, final newlines, and no trailing whitespace. PHP uses PSR-4 under `App\`, strict type hints where practical, `PascalCase` classes, and `camelCase` methods and variables. Match existing `final` classes and constructor property promotion. JavaScript modules use `camelCase` exports and semicolons; CSS classes use kebab-case. Keep controllers thin and place Jira HTTP behavior in the service layer.

## Testing Guidelines

PHPUnit and JavaScript unit tests are committed under `tests/`. For every change, run `composer validate --strict`, `composer check`, `npm run lint`, and syntax-check changed PHP files with `php -l path/to/File.php`. Manually exercise affected pages and API routes against a test Jira instance. PHPUnit tests use the `App\Tests\` namespace and files are named `*Test.php`.

## Commit & Pull Request Guidelines

The repository has no commit history from which to infer a convention. Use short, imperative commits; Conventional Commit prefixes such as `feat:`, `fix:`, and `docs:` are encouraged. Pull requests should explain the user-visible change, list verification performed, link the Jira/GitHub issue, and include screenshots for board, dialog, or theme changes. Never commit `.env.local`, Jira credentials, API tokens, or production secrets.
