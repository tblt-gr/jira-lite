<?php

declare(strict_types=1);

namespace App\Dto\Request;

use Symfony\Component\Validator\Constraints as Assert;

final readonly class TransitionRequest
{
    public function __construct(
        #[Assert\NotBlank]
        public string $transitionId,
        #[Assert\Positive]
        public ?int $boardId = null,
    ) {
    }
}
