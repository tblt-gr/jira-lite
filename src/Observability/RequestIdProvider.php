<?php

declare(strict_types=1);

namespace App\Observability;

final class RequestIdProvider
{
    private string $requestId = 'cli';

    public function setRequestId(string $requestId): void
    {
        $this->requestId = $requestId;
    }

    public function getRequestId(): string
    {
        return $this->requestId;
    }
}
