#syntax=docker/dockerfile:1

# Base image with FrankenPHP and PHP 8.3 on Alpine Linux
FROM dunglas/frankenphp:1-php8.3-alpine AS frankenphp_base

WORKDIR /app

VOLUME /app/var/

# Install PHP extensions required by Symfony
RUN install-php-extensions \
    intl \
    zip \
    opcache && \
    apk add --no-cache curl && \
    addgroup -S -g 1000 app && \
    adduser -S -D -u 1000 -G app app

# Environment configuration
ENV COMPOSER_ALLOW_SUPERUSER=1 \
    SERVER_NAME=:8080

# Base PHP configuration
COPY docker/php/conf.d/app.ini $PHP_INI_DIR/conf.d/

# Entrypoint configuration
COPY docker/entrypoint.sh /usr/local/bin/docker-entrypoint
RUN chmod +x /usr/local/bin/docker-entrypoint

ENTRYPOINT ["docker-entrypoint"]
CMD ["--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]

# Development stage
FROM frankenphp_base AS frankenphp_dev

ENV APP_ENV=dev \
    XDEBUG_MODE=off

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY docker/php/conf.d/app.dev.ini $PHP_INI_DIR/conf.d/

# Production build stage. Composer is intentionally absent from the runtime image.
FROM frankenphp_base AS frankenphp_builder

ENV APP_ENV=prod

COPY --link . .
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# .env is never committed (it holds real Jira credentials); Symfony's dotenv
# loader requires the file to exist regardless. The placeholder values below
# are only used to compile the container and warm the cache at build time —
# actual runtime values are injected as real environment variables by
# compose.yaml and take precedence over anything in this file.
RUN cp .env.example .env && \
    composer install --no-dev --no-progress --no-interaction --optimize-autoloader && \
    php bin/console asset-map:compile && \
    php bin/console cache:warmup && \
    rm .env

# Production runtime stage
FROM frankenphp_base AS frankenphp_prod

ENV APP_ENV=prod

COPY docker/php/conf.d/app.prod.ini $PHP_INI_DIR/conf.d/
COPY --from=frankenphp_builder --chown=app:app /app /app

RUN chown -R app:app /app/var && chmod -R 775 /app/var

USER app

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8080/health || exit 1
