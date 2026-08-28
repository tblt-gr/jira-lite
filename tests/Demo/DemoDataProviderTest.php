<?php

declare(strict_types=1);

namespace App\Tests\Demo;

use App\Demo\DemoDataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

final class DemoDataProviderTest extends TestCase
{
    private DemoDataProvider $demo;

    protected function setUp(): void
    {
        $this->demo = new DemoDataProvider();
    }

    public function testItProvidesTheExpectedScreenshotCatalog(): void
    {
        $boards = $this->demo->boards();
        $populated = $this->demo->snapshot(
            DemoDataProvider::POPULATED_BOARD_ID,
        );
        $empty = $this->demo->snapshot(
            DemoDataProvider::EMPTY_BOARD_ID,
        );

        self::assertCount(2, $boards);
        self::assertSame(
            ['Nimbus Product Board', 'Nimbus Empty Board'],
            array_column($boards, 'name'),
        );
        self::assertCount(2, $populated['epics']['values']);
        self::assertCount(8, $populated['issues']['issues']);
        self::assertSame([], $empty['epics']['values']);
        self::assertSame([], $empty['issues']['issues']);
        self::assertCount(3, $this->demo->users('a'));
    }

    public function testEveryBoardIssueCanBeOpenedWithConsistentReferences(): void
    {
        $snapshot = $this->demo->snapshot(
            DemoDataProvider::POPULATED_BOARD_ID,
        );
        $epicIds = array_column($snapshot['epics']['values'], 'id');
        $statusIds = [];

        foreach ($snapshot['configuration']['columnConfig']['columns'] as $column) {
            array_push($statusIds, ...array_column($column['statuses'], 'id'));
        }

        foreach ($snapshot['issues']['issues'] as $boardIssue) {
            $issue = $this->demo->issue($boardIssue['key']);

            self::assertContains($issue['fields']['epic']['id'], $epicIds);
            self::assertContains($issue['fields']['status']['id'], $statusIds);
            self::assertNotEmpty($issue['fields']['assignee']['accountId']);
            self::assertSame($boardIssue['key'], $issue['key']);
            self::assertSame('doc', $issue['fields']['description']['type']);
        }
    }

    public function testUnknownDemoDataIsRejected(): void
    {
        $this->expectException(NotFoundHttpException::class);

        $this->demo->issue('NIM-999');
    }
}
