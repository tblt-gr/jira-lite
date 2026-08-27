<?php

declare(strict_types=1);

namespace App\Logger;

use App\Observability\RequestIdProvider;
use Monolog\LogRecord;

final readonly class RequestIdProcessor
{
    public function __construct(private RequestIdProvider $requestIdProvider)
    {
    }

    public function __invoke(LogRecord $record): LogRecord
    {
        return $record->with(extra: [
            ...$record->extra,
            'request_id' => $this->requestIdProvider->getRequestId(),
        ]);
    }
}
