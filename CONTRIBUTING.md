# Contributing to Jira Lite

Jira Lite is a local-first, single-user Jira client. Changes must preserve that boundary unless the architecture decision records are updated first.

## Development workflow

1. Create a focused branch and make one coherent change at a time.
2. Use short imperative Conventional Commit messages, for example `fix: handle empty Jira comments`.
3. Run `composer check`, `npm run lint`, and `npm test` before opening a pull request.
4. Explain the user-visible outcome, link the issue, and include screenshots for visual changes.

Never commit `.env.local`, Jira API tokens, Jira URLs containing sensitive paths, or generated artifacts.

## Releases

The release workflow runs from a tagged commit. Before tagging, ensure the CI gate is green, update user-facing documentation, and verify the production Docker image locally with `docker compose -f compose.prod.yaml up -d`.
