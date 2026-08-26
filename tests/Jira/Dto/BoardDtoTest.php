<?php

declare(strict_types=1);

namespace App\Tests\Jira\Dto;

use App\Jira\Dto\BoardIssue;
use App\Jira\Dto\BoardSnapshot;

use const JSON_THROW_ON_ERROR;

use PHPUnit\Framework\TestCase;

final class BoardDtoTest extends TestCase
{
    public function testIssueSerializationPreservesTheFrontendContract(): void
    {
        $issue = BoardIssue::fromJira([
            'id' => '10001',
            'key' => 'APP-1',
            'self' => 'https://jira.example.test/APP-1',
            'fields' => [
                'summary' => 'Preserve JSON',
                'description' => ['type' => 'doc'],
            ],
        ], ['summary']);

        self::assertSame([
            'id' => '10001',
            'key' => 'APP-1',
            'self' => 'https://jira.example.test/APP-1',
            'fields' => ['summary' => 'Preserve JSON'],
        ], $issue->jsonSerialize());
    }

    public function testSnapshotSerializationPreservesNestedJiraData(): void
    {
        $snapshot = BoardSnapshot::fromJira([
            'board' => ['id' => 7, 'name' => 'Delivery'],
            'configuration' => ['columnConfig' => ['columns' => [
                ['name' => 'To do'],
            ]]],
            'epics' => ['values' => [['id' => 3, 'name' => 'Platform']]],
            'issues' => ['issues' => []],
        ]);

        self::assertSame([
            'board' => ['id' => 7, 'name' => 'Delivery'],
            'configuration' => ['columnConfig' => ['columns' => [
                ['name' => 'To do'],
            ]]],
            'epics' => ['values' => [['id' => 3, 'name' => 'Platform']]],
            'issues' => ['issues' => []],
        ], json_decode(
            json_encode($snapshot, JSON_THROW_ON_ERROR),
            true,
            flags: JSON_THROW_ON_ERROR
        ));
    }
}
