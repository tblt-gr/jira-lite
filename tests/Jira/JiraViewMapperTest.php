<?php

declare(strict_types=1);

namespace App\Tests\Jira;

use App\Jira\JiraViewMapper;
use PHPUnit\Framework\TestCase;

final class JiraViewMapperTest extends TestCase
{
    public function testItKeepsOnlyBoardFieldsAndNamedCustomFields(): void
    {
        $mapper = new JiraViewMapper();
        $result = $mapper->boardIssues([
            'names' => [
                'customfield_1' => 'Epic Link',
                'customfield_2' => 'Unused field',
            ],
            'issues' => [[
                'id' => '100',
                'key' => 'APP-1',
                'fields' => [
                    'summary' => 'Découper le board',
                    'status' => ['id' => '2', 'name' => 'En cours'],
                    'customfield_1' => 'EPIC-1',
                    'customfield_2' => 'secret payload',
                    'description' => ['type' => 'doc'],
                ],
            ]],
        ]);

        self::assertSame('APP-1', $result['issues'][0]['key']);
        self::assertSame(
            ['summary', 'status', 'customfield_1'],
            array_keys($result['issues'][0]['fields'])
        );
    }

    public function testItKeepsFixVersionsForTheVersionFilter(): void
    {
        $result = (new JiraViewMapper())->boardIssue([
            'key' => 'APP-3',
            'fields' => [
                'fixVersions' => [['id' => '10', 'name' => '1.4.0']],
            ],
        ]);

        self::assertSame(
            [['id' => '10', 'name' => '1.4.0']],
            $result['fields']['fixVersions']
        );
    }

    public function testItAcceptsMissingFields(): void
    {
        $result = (new JiraViewMapper())->boardIssue(['key' => 'APP-2']);

        self::assertSame(['key' => 'APP-2', 'fields' => []], $result);
    }
}
