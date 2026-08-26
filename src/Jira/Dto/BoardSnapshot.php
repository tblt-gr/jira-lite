<?php

declare(strict_types=1);

namespace App\Jira\Dto;

use function is_array;

use JsonSerializable;

final readonly class BoardSnapshot implements JsonSerializable
{
    /**
     * @param array<string, mixed> $board
     * @param array<string, mixed> $configuration
     * @param array<string, mixed> $epics
     * @param array<string, mixed> $issues
     */
    public function __construct(
        private array $board,
        private array $configuration,
        private array $epics,
        private array $issues,
    ) {
    }

    /** @param array<string, mixed> $raw */
    public static function fromJira(array $raw): self
    {
        $configuration = is_array($raw['configuration'] ?? null)
            ? $raw['configuration']
            : [];
        $columnConfig = is_array($configuration['columnConfig'] ?? null)
            ? $configuration['columnConfig']
            : [];
        $columns = $columnConfig['columns'] ?? null;

        if (is_array($columns)) {
            $columnConfig['columns'] = array_map(
                static fn (mixed $column): mixed => is_array($column)
                    ? BoardColumn::fromJira($column)
                    : $column,
                $columns,
            );
            $configuration['columnConfig'] = $columnConfig;
        }

        $epics = is_array($raw['epics'] ?? null) ? $raw['epics'] : [];
        $values = $epics['values'] ?? null;

        if (is_array($values)) {
            $epics['values'] = array_map(
                static fn (mixed $epic): mixed => is_array($epic)
                    ? Epic::fromJira($epic)
                    : $epic,
                $values,
            );
        }

        return new self(
            is_array($raw['board'] ?? null) ? $raw['board'] : [],
            $configuration,
            $epics,
            is_array($raw['issues'] ?? null) ? $raw['issues'] : [],
        );
    }

    /** @return array<string, mixed> */
    public function jsonSerialize(): array
    {
        return [
            'board' => $this->board,
            'configuration' => $this->configuration,
            'epics' => $this->epics,
            'issues' => $this->issues,
        ];
    }
}
