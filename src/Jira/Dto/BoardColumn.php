<?php

declare(strict_types=1);

namespace App\Jira\Dto;

use JsonSerializable;

final readonly class BoardColumn implements JsonSerializable
{
    /** @param array<string, mixed> $data */
    public function __construct(private array $data)
    {
    }

    /** @param array<string, mixed> $raw */
    public static function fromJira(array $raw): self
    {
        return new self($raw);
    }

    /** @return array<string, mixed> */
    public function jsonSerialize(): array
    {
        return $this->data;
    }
}
