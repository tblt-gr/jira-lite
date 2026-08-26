<?php

declare(strict_types=1);

namespace App\Dto\Request;

use Symfony\Component\Validator\Constraints as Assert;

final readonly class AddCommentRequest
{
    /** @param list<array{accountId: string, text: string}> $mentions */
    public function __construct(
        #[Assert\NotBlank]
        public string $comment,
        #[Assert\Count(max: 20)]
        public array $mentions = [],
    ) {
    }
}
