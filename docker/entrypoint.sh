#!/bin/sh
set -e

# First arg is `-f` or `--some-option` or starts with `-`
if [ "${1#-}" != "$1" ]; then
    set -- frankenphp run "$@"
fi

if [ "$1" = 'frankenphp' ] || [ "$1" = 'php' ] || [ "$1" = 'bin/console' ]; then
    # Ensure var directories exist with write permissions.
    mkdir -p var/cache var/log var/share
    chmod -R 775 var 2>/dev/null || true

    if [ "$APP_ENV" != 'prod' ]; then
        if [ ! -d vendor ] || [ ! -f vendor/autoload.php ]; then
            echo "Installing Composer dependencies..."
            composer install --prefer-dist --no-progress --no-interaction
        fi
    fi
fi

exec docker-php-entrypoint "$@"
