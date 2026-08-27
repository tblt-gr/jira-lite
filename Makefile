.DEFAULT_GOAL := help

COMPOSE := docker compose

.PHONY: install dev up down logs shell test lint fix check build-prod help

install: ## Install PHP and JavaScript dependencies
	composer install
	npm ci

dev: ## Run the PHP development server on loopback
	php -S 127.0.0.1:8000 -t public public/index.php

up: ## Start the Docker development profile
	$(COMPOSE) up -d

down: ## Stop the Docker development profile
	$(COMPOSE) down

logs: ## Follow Docker development logs
	$(COMPOSE) logs --follow app

shell: ## Open a shell in the Docker development container
	$(COMPOSE) exec app sh

test: ## Run PHP and JavaScript tests
	composer test
	npm test

lint: ## Run PHP and JavaScript linters
	composer lint
	npm run lint

fix: ## Apply PHP coding-style fixes
	composer cs-fix

check: ## Run the complete PHP check and JavaScript lint
	composer check
	npm run lint

build-prod: ## Build the immutable local production image
	docker build --target frankenphp_prod -t jira-lite:prod .

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "%-14s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
