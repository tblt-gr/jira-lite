<?php

declare(strict_types=1);

namespace App\Tests\Jira\Document;

use App\Jira\Document\AdfDocumentFactory;
use PHPUnit\Framework\TestCase;

final class AdfDocumentFactoryTest extends TestCase
{
    public function testItPlacesMentionsInTheirTextOrder(): void
    {
        $document = (new AdfDocumentFactory())->plainTextDocument(
            'Hello @Ada and @Linus',
            [
                ['accountId' => 'linus', 'text' => '@Linus'],
                ['accountId' => 'ada', 'text' => '@Ada'],
            ]
        );

        self::assertSame([
            ['type' => 'text', 'text' => 'Hello '],
            ['type' => 'mention', 'attrs' => ['id' => 'ada', 'text' => '@Ada']],
            ['type' => 'text', 'text' => ' and '],
            ['type' => 'mention', 'attrs' => ['id' => 'linus', 'text' => '@Linus']],
        ], $document['content'][0]['content']);
    }
}
