<?php

declare(strict_types=1);

namespace App\Tests\Board;

use App\Board\BoardSnapshotProvider;
use App\Jira\JiraClient;
use App\Jira\JiraMediaProxy;
use App\Jira\JiraViewMapper;
use App\Service\JiraApiService;

use const JSON_THROW_ON_ERROR;

use PHPUnit\Framework\TestCase;
use Symfony\Component\Cache\Adapter\ArrayAdapter;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;
use Symfony\Component\Translation\Translator;

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
        $jira = new JiraApiService(
            new JiraClient(
                $http,
                'https://jira.example.test',
                'user@example.com',
                'token'
            ),
            new JiraMediaProxy(
                $http,
                'https://jira.example.test',
                'user@example.com',
                'token',
                new Translator('fr')
            )
        );
        $provider = new BoardSnapshotProvider(
            $jira,
            new ArrayAdapter(),
            new JiraViewMapper()
        );

        $first = $provider->getSnapshot(7);
        $second = $provider->getSnapshot(7);

        self::assertSame('Delivery', $first['board']['name']);
        self::assertArrayHasKey('snapshotAt', $first['issues']);
        self::assertArrayNotHasKey(
            'description',
            $first['issues']['issues'][0]['fields']
        );
        self::assertSame($first, $second);
    }

    private function json(array $data): MockResponse
    {
        return new MockResponse(json_encode($data, JSON_THROW_ON_ERROR));
    }
}
