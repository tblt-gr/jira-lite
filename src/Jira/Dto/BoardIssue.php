<?php

declare(strict_types=1);

namespace App\Jira\Dto;

use function array_fill_keys;
use function array_filter;
use function array_intersect_key;
use function array_key_exists;
use function is_array;

use JsonSerializable;

use function strtolower;

final readonly class BoardIssue implements JsonSerializable
{
    /** @param array<string, mixed> $fields */
    public function __construct(
        private ?string $id,
        private ?string $key,
        private ?string $self,
        private array $fields,
    ) {
    }

    /**
     * @param array<string, mixed> $raw
     * @param list<string>         $allowedFields
     */
    public static function fromJira(array $raw, array $allowedFields): self
    {
        $sourceFields = is_array($raw['fields'] ?? null)
            ? $raw['fields']
            : [];

        return new self(
            array_key_exists('id', $raw) ? (string) $raw['id'] : null,
            array_key_exists('key', $raw) ? (string) $raw['key'] : null,
            array_key_exists('self', $raw) ? (string) $raw['self'] : null,
            array_intersect_key($sourceFields, array_fill_keys($allowedFields, true)),
        );
    }

    public function hasActiveSprint(string $sprintField): bool
    {
        $value = $this->fields[$sprintField] ?? null;
        $sprints = is_array($value) && array_key_exists('state', $value)
            ? [$value]
            : $value;

        if (!is_array($sprints)) {
            return false;
        }

        foreach ($sprints as $sprint) {
            if (
                is_array($sprint)
                && 'active' === strtolower((string) ($sprint['state'] ?? ''))
            ) {
                return true;
            }
        }

        return false;
    }

    /** @return array<string, mixed> */
    public function jsonSerialize(): array
    {
        return array_filter([
            'id' => $this->id,
            'key' => $this->key,
            'self' => $this->self,
            'fields' => $this->fields,
        ], static fn (mixed $value): bool => null !== $value);
    }
}
