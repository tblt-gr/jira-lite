<?php

declare(strict_types=1);

namespace App\Tests\Board;

use App\Board\BoardSnapshotProvider;
use App\Jira\Document\AdfDocumentFactory;
use App\Jira\JiraClient;
use App\Jira\JiraViewMapper;
use App\Jira\Repository\BoardRepository;

use const JSON_THROW_ON_ERROR;

use PHPUnit\Framework\TestCase;
use Symfony\Component\Cache\Adapter\ArrayAdapter;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;

final class BoardSnapshotProviderTest extends TestCase
{
    public function testItBuildsAndCachesAMinimalBoardSnapshot(): void
    {
        $http = new MockHttpClient([
            $this->json(['id' => 7, 'name' => 'Delivery']),
            $this->json(['columnConfig' => ['columns' => []]]),
            $this->json(['values' => []]),
            $this->json([
                'names' => [],
                'issues' => [[
                    'key' => 'APP-1',
                    'fields' => [
                        'summary' => 'Refactor',
                        'description' => ['type' => 'doc'],
                    ],
                ]],
                'total' => 1,
            ]),
        ]);
        $jira = new BoardRepository(
            new JiraClient(
                $http,
                'https://jira.example.test',
                'user@example.com',
                'token'
            ),
            new AdfDocumentFactory()
        );
        $provider = new BoardSnapshotProvider(
            $jira,
            new ArrayAdapter(),
            new JiraViewMapper('customfield_10016', 'customfield_10026')
        );

        $first = $provider->getSnapshot(7);
        $second = $provider->getSnapshot(7);

        $firstJson = json_decode(
            json_encode($first, JSON_THROW_ON_ERROR),
            true,
            flags: JSON_THROW_ON_ERROR
        );
        $secondJson = json_decode(
            json_encode($second, JSON_THROW_ON_ERROR),
            true,
            flags: JSON_THROW_ON_ERROR
        );

        self::assertSame('Delivery', $firstJson['board']['name']);
        self::assertArrayHasKey('snapshotAt', $firstJson['issues']);
        self::assertArrayNotHasKey(
            'description',
            $firstJson['issues']['issues'][0]['fields']
        );
        self::assertSame($firstJson, $secondJson);
    }

    /**
     * @param array<string, mixed> $data
     */
    private function json(array $data): MockResponse
    {
        return new MockResponse(json_encode($data, JSON_THROW_ON_ERROR));
    }
}
