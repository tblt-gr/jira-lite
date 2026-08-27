<?php

declare(strict_types=1);

namespace App\Dto\Request;

use Symfony\Component\Validator\Constraints as Assert;

final readonly class CreateIssueRequest
{
    public function __construct(
        #[Assert\NotBlank]
        #[Assert\Regex('/^\d+$/')]
        public string $issueTypeId,
        #[Assert\NotBlank]
        #[Assert\Length(max: 255)]
        public string $summary,
        public ?string $description = null,
        #[Assert\Regex('/^\d+$/')]
        public ?string $sprintId = null,
        #[Assert\Regex('/^[A-Z][A-Z0-9_]*-\d+$/i')]
        public ?string $epicKey = null,
    ) {
    }
}
