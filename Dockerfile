#syntax=docker/dockerfile:1

# Base image with FrankenPHP and PHP 8.3 on Alpine Linux
FROM dunglas/frankenphp:1-php8.3-alpine AS frankenphp_base

WORKDIR /app

VOLUME /app/var/

# Install PHP extensions required by Symfony
RUN install-php-extensions \
    intl \
    zip \
    opcache

# Install Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Environment configuration
ENV COMPOSER_ALLOW_SUPERUSER=1 \
    SERVER_NAME=:80

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

COPY docker/php/conf.d/app.dev.ini $PHP_INI_DIR/conf.d/

# Production stage
FROM frankenphp_base AS frankenphp_prod

ENV APP_ENV=prod

COPY --link . .

RUN composer install --no-dev --no-progress --no-interaction --optimize-autoloader && \
    php bin/console asset-map:compile && \
    php bin/console cache:warmup
