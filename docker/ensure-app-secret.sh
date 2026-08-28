#!/bin/sh
set -eu

environment="${1:-${APP_ENV:-dev}}"

if [ -n "${APP_SECRET:-}" ]; then
    exit 0
fi

for dotenv_file in \
    .env \
    .env.local \
    ".env.${environment}" \
    ".env.${environment}.local"
do
    if [ -f "$dotenv_file" ] && grep -Eq \
        '^[[:space:]]*APP_SECRET[[:space:]]*=[[:space:]]*[^[:space:]].*$' \
        "$dotenv_file"
    then
        exit 0
    fi
done

vault_directory="config/secrets/${environment}"
public_key="${vault_directory}/${environment}.encrypt.public.php"
private_key="${vault_directory}/${environment}.decrypt.private.php"
secret_list="${vault_directory}/${environment}.list.php"

if [ -f "$secret_list" ] && php -r \
    '$secrets = require $argv[1]; exit(array_key_exists("APP_SECRET", $secrets) ? 0 : 1);' \
    "$secret_list"
then
    exit 0
fi

if [ ! -f "$public_key" ] && [ ! -f "$private_key" ]; then
    JIRA_BASE_URL="${JIRA_BASE_URL:-https://jira.invalid}" \
    JIRA_EMAIL="${JIRA_EMAIL:-jira-lite@example.invalid}" \
    JIRA_API_TOKEN="${JIRA_API_TOKEN:-bootstrap-only}" \
    php bin/console secrets:generate-keys \
        --env="$environment" \
        --quiet \
        --no-interaction
fi

JIRA_BASE_URL="${JIRA_BASE_URL:-https://jira.invalid}" \
JIRA_EMAIL="${JIRA_EMAIL:-jira-lite@example.invalid}" \
JIRA_API_TOKEN="${JIRA_API_TOKEN:-bootstrap-only}" \
php bin/console secrets:set APP_SECRET \
    --env="$environment" \
    --random=64 \
    --quiet \
    --no-interaction

echo "Generated APP_SECRET in the Symfony ${environment} vault."
