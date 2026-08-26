<?php

declare(strict_types=1);

namespace App\Tests\Logger;

use App\Logger\SecretRedactingProcessor;
use DateTimeImmutable;
use Monolog\Level;
use Monolog\LogRecord;
use PHPUnit\Framework\TestCase;

final class SecretRedactingProcessorTest extends TestCase
{
    public function testItRedactsTheJiraTokenAndBasicCredentials(): void
    {
        $record = new LogRecord(
            new DateTimeImmutable(),
            'app',
            Level::Error,
            'Authorization: Basic dXNlcjp0b2tlbg== token',
            ['url' => 'https://jira.test/?token=token']
        );

        $redacted = (new SecretRedactingProcessor('token'))($record);

        self::assertSame('Authorization: Basic *** ***', $redacted->message);
        self::assertSame('https://jira.test/?***=***', $redacted->context['url']);
    }
}
