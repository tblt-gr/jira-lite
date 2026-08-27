<?php

declare(strict_types=1);

namespace App\Dto\Request;

use App\Validator\JiraDuration;
use Symfony\Component\Validator\Constraints as Assert;

final readonly class UpdateIssueRequest
{
    /** @param list<string>|null $labels */
    public function __construct(
        #[Assert\NotBlank(allowNull: true)]
        #[Assert\Length(max: 255)]
        public ?string $summary = null,
        public ?string $description = null,
        #[Assert\Type('array')]
        #[Assert\Count(max: 20)]
        public mixed $labels = null,
        #[Assert\Regex(pattern: '/^\d{4}-\d{2}-\d{2}$/')]
        public ?string $dueDate = null,
        #[JiraDuration]
        public ?string $originalEstimate = null,
        #[JiraDuration]
        public ?string $remainingEstimate = null,
    ) {
    }
}
