<?php

declare(strict_types=1);

namespace App\Logger;

use function is_array;
use function is_string;

use Monolog\LogRecord;

final readonly class SecretRedactingProcessor
{
    public function __construct(private string $apiToken)
    {
    }

    public function __invoke(LogRecord $record): LogRecord
    {
        return $record->with(
            message: $this->redact($record->message),
            context: $this->redactValue($record->context),
            extra: $this->redactValue($record->extra),
        );
    }

    /**
     * @param array<mixed> $value
     *
     * @return array<mixed>
     */
    private function redactValue(array $value): array
    {
        foreach ($value as $key => $item) {
            $value[$key] = is_array($item)
                ? $this->redactValue($item)
                : (is_string($item) ? $this->redact($item) : $item);
        }

        return $value;
    }

    private function redact(string $value): string
    {
        $value = preg_replace(
            '/Basic\\s+[A-Za-z0-9+\\/=]+/i',
            'Basic ***',
            $value
        ) ?? $value;

        return '' === $this->apiToken
            ? $value
            : str_replace($this->apiToken, '***', $value);
    }
}
