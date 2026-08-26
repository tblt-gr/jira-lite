<?php

declare(strict_types=1);

namespace App\Tests\Jira;

use App\Jira\JiraViewMapper;
use PHPUnit\Framework\TestCase;

final class JiraViewMapperTest extends TestCase
{
    public function testItKeepsOnlyBoardFieldsAndNamedCustomFields(): void
    {
        $mapper = $this->mapper();
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

        $issue = $result['issues'][0]->jsonSerialize();

        self::assertSame('APP-1', $issue['key']);
        self::assertSame(
            ['summary', 'status', 'customfield_1'],
            array_keys($issue['fields'])
        );
    }

    public function testItKeepsFixVersionsForTheVersionFilter(): void
    {
        $result = $this->mapper()->boardIssue([
            'key' => 'APP-3',
            'fields' => [
                'fixVersions' => [['id' => '10', 'name' => '1.4.0']],
            ],
        ]);

        $issue = $result->jsonSerialize();

        self::assertSame(
            [['id' => '10', 'name' => '1.4.0']],
            $issue['fields']['fixVersions']
        );
    }

    public function testItAcceptsMissingFields(): void
    {
        $result = $this->mapper()->boardIssue(['key' => 'APP-2']);

        self::assertSame(
            ['key' => 'APP-2', 'fields' => []],
            $result->jsonSerialize()
        );
    }

    private function mapper(): JiraViewMapper
    {
        return new JiraViewMapper('customfield_10016', 'customfield_10026');
    }
}
