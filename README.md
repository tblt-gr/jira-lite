# Jira Lite

Jira Lite is a fast, focused interface for everyday Jira board workflows. It avoids loading Jira's full user interface while retaining the essentials: board navigation, epic filtering, issue details, live updates, and workflow transitions.

The application uses Symfony 7.4 on the server and lightweight JavaScript modules with Stimulus in the browser. Jira credentials remain on the server and are never exposed to the client.

## Requirements

- PHP 8.2 or later
- Composer
- A Jira Cloud account with an API token

## Installation

Install the PHP dependencies:

```bash
composer install
```

Create the local environment file:

```bash
cp .env.example .env.local
```

Configure the following values in `.env.local`:

```dotenv
APP_SECRET=use-a-long-random-value
JIRA_BASE_URL=https://your-instance.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=your-api-token
```

Generate a suitable application secret with:

```bash
php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
```

## Running Locally

Start PHP's built-in server from the repository root:

```bash
php -S 127.0.0.1:8000 -t public public/index.php
```

Open <http://127.0.0.1:8000>, select a Jira board, and use the board view to inspect or transition issues.

## Development Checks

Run the project checks before committing:

```bash
composer check
```

This validates Composer metadata and checks the Symfony container, YAML configuration, and Twig templates. JavaScript is served through Symfony AssetMapper, so no Node.js build step is required.

## Project Structure

- `src/Controller/` contains page and JSON API endpoints.
- `src/Service/JiraApiService.php` handles Jira REST requests and media proxying.
- `assets/board/` contains board state, rendering, API, and refresh modules.
- `assets/controllers/` contains Stimulus controllers.
- `assets/styles/` contains application styles.
- `templates/` contains Twig page templates.

## Security

Do not commit `.env.local` or Jira credentials. The current prototype uses one server-side Jira identity and does not yet provide application-level authentication or authorization. Keep deployments private until access control and POST request protection are implemented.

## License

This repository is currently proprietary. No permission to redistribute or reuse the code is granted unless a separate license is added.
