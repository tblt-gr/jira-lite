<?php

declare(strict_types=1);

namespace App\Dto\Request;

use App\Validator\JiraDuration;
use Symfony\Component\Validator\Constraints as Assert;

final readonly class AddWorklogRequest
{
    public function __construct(
        #[Assert\NotBlank]
        #[JiraDuration]
        public string $timeSpent,
        public ?string $comment = null,
        #[Assert\DateTime(format: 'Y-m-d\TH:i:s.vO')]
        public ?string $started = null,
    ) {
    }
}
