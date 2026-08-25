<?php

namespace App\Tests\Controller;

use App\Board\BoardSnapshotProvider;
use App\Controller\JiraController;
use App\Jira\JiraClient;
use App\Jira\JiraMediaProxy;
use App\Jira\JiraViewMapper;
use App\Service\JiraApiService;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Cache\Adapter\ArrayAdapter;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Translation\Translator;

final class JiraControllerTest extends TestCase
{
    public function testTransitionReturnsTheUpdatedIssue(): void
    {
        $http = new MockHttpClient([
            new MockResponse('', ['http_code' => 204]),
            new MockResponse(json_encode([
                'key' => 'APP-1',
                'fields' => [
                    'status' => ['id' => '3', 'name' => 'Terminé'],
                ],
            ], JSON_THROW_ON_ERROR)),
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
        $cache = new ArrayAdapter();
        $controller = new JiraController(
            $jira,
            $cache,
            new BoardSnapshotProvider($jira, $cache, new JiraViewMapper()),
            new Translator('fr')
        );
        $request = Request::create(
            '/api/jira/issue/APP-1/transition',
            'POST',
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode([
                'transitionId' => '31',
                'boardId' => 7,
            ], JSON_THROW_ON_ERROR)
        );

        $response = $controller->transition('APP-1', $request);
        $payload = json_decode(
            (string) $response->getContent(),
            true,
            flags: JSON_THROW_ON_ERROR
        );

        self::assertSame('APP-1', $payload['key']);
        self::assertSame('3', $payload['fields']['status']['id']);
        self::assertStringContainsString(
            'no-store',
            (string) $response->headers->get('Cache-Control')
        );
    }
}
