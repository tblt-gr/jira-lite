<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Board\BoardSnapshotProvider;
use App\Controller\JiraBoardController;
use App\Controller\JiraIssueController;
use App\Jira\Document\AdfDocumentFactory;
use App\Jira\JiraClient;
use App\Jira\JiraViewMapper;
use App\Jira\Repository\BoardRepository;
use App\Jira\Repository\IssueRepository;
use App\Jira\Repository\UserRepository;
use App\Service\JiraApiRequestHandler;

use const JSON_THROW_ON_ERROR;

use LogicException;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use Symfony\Component\Cache\Adapter\ArrayAdapter;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Translation\Translator;
use Symfony\Component\Validator\Validation;

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
        $controller = $this->createIssueController($http);
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

    public function testCreateMetadataReturnsProjectTypesAndActiveSprints(): void
    {
        $requests = 0;
        $http = new MockHttpClient(static function () use (&$requests): MockResponse {
            ++$requests;

            return match ($requests) {
                1 => new MockResponse(json_encode([
                    'id' => 7,
                    'type' => 'scrum',
                    'location' => [
                        'projectId' => 10001,
                        'projectKey' => 'APP',
                        'projectName' => 'Application',
                    ],
                ], JSON_THROW_ON_ERROR)),
                2 => new MockResponse(json_encode(['issueTypes' => [
                    ['id' => '10001', 'name' => 'Tâche', 'subtask' => false],
                    ['id' => '10002', 'name' => 'Sous-tâche', 'subtask' => true],
                ]], JSON_THROW_ON_ERROR)),
                3 => new MockResponse(json_encode(['values' => [
                    ['id' => 42, 'name' => 'Sprint 42', 'state' => 'active'],
                ]], JSON_THROW_ON_ERROR)),
                default => throw new LogicException('Unexpected Jira request.'),
            };
        });
        $controller = $this->createController($http);

        $response = $controller->createMetadata(7);
        $payload = json_decode(
            (string) $response->getContent(),
            true,
            flags: JSON_THROW_ON_ERROR
        );

        self::assertSame('APP', $payload['project']['key']);
        self::assertSame([
            ['id' => '10001', 'name' => 'Tâche'],
        ], $payload['issueTypes']);
        self::assertSame([
            ['id' => '42', 'name' => 'Sprint 42'],
        ], $payload['sprints']);
        self::assertSame(3, $requests);
    }

    public function testCreateIssueAddsItToTheSelectedSprint(): void
    {
        $calls = [];
        $responses = [
            new MockResponse(json_encode([
                'id' => 7,
                'location' => [
                    'projectId' => 10001,
                    'projectKey' => 'APP',
                    'projectName' => 'Application',
                ],
            ], JSON_THROW_ON_ERROR)),
            new MockResponse(json_encode([
                'id' => '10101',
                'key' => 'APP-123',
            ], JSON_THROW_ON_ERROR), ['http_code' => 201]),
            new MockResponse('', ['http_code' => 204]),
            new MockResponse('', ['http_code' => 204]),
            new MockResponse(json_encode([
                'id' => '10101',
                'key' => 'APP-123',
                'fields' => ['summary' => 'Nouveau ticket'],
            ], JSON_THROW_ON_ERROR)),
        ];
        $http = new MockHttpClient(static function (
            string $method,
            string $url,
            array $options,
        ) use (&$calls, &$responses): MockResponse {
            $calls[] = [
                'method' => $method,
                'url' => $url,
                'body' => $options['body'] ?? '',
            ];

            return array_shift($responses)
                ?? throw new LogicException('Unexpected Jira request.');
        });
        $controller = $this->createController($http);
        $request = Request::create(
            '/api/jira/board/7/issues',
            'POST',
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode([
                'issueTypeId' => '10001',
                'summary' => 'Nouveau ticket',
                'description' => 'Contexte utile',
                'sprintId' => '42',
                'epicKey' => 'APP-10',
            ], JSON_THROW_ON_ERROR)
        );

        $response = $controller->createIssue(7, $request);
        $payload = json_decode(
            (string) $response->getContent(),
            true,
            flags: JSON_THROW_ON_ERROR
        );
        $createPayload = json_decode(
            (string) $calls[1]['body'],
            true,
            flags: JSON_THROW_ON_ERROR
        );
        $sprintPayload = json_decode(
            (string) $calls[3]['body'],
            true,
            flags: JSON_THROW_ON_ERROR
        );
        $parentPayload = json_decode(
            (string) $calls[2]['body'],
            true,
            flags: JSON_THROW_ON_ERROR
        );

        self::assertSame(201, $response->getStatusCode());
        self::assertSame('APP-123', $payload['key']);
        self::assertSame('POST', $calls[1]['method']);
        self::assertSame(
            'https://jira.example.test/rest/api/3/issue',
            $calls[1]['url']
        );
        self::assertSame('10001', $createPayload['fields']['project']['id']);
        self::assertSame('10001', $createPayload['fields']['issuetype']['id']);
        self::assertSame(
            'doc',
            $createPayload['fields']['description']['type']
        );
        self::assertSame('PUT', $calls[2]['method']);
        self::assertStringEndsWith(
            '/rest/api/3/issue/APP-123',
            $calls[2]['url']
        );
        self::assertSame(
            'APP-10',
            $parentPayload['fields']['parent']['key']
        );
        self::assertStringEndsWith(
            '/rest/agile/1.0/sprint/42/issue',
            $calls[3]['url']
        );
        self::assertSame(['APP-123'], $sprintPayload['issues']);
    }

    private function createController(MockHttpClient $http): JiraBoardController
    {
        [$issues, $users, $snapshots, $handler] = $this->dependencies($http);

        return new JiraBoardController($snapshots, $handler);
    }

    private function createIssueController(MockHttpClient $http): JiraIssueController
    {
        [$issues, $users, $snapshots, $handler] = $this->dependencies($http);

        return new JiraIssueController($issues, $users, $handler);
    }

    /** @return array{IssueRepository, UserRepository, BoardSnapshotProvider, JiraApiRequestHandler} */
    private function dependencies(MockHttpClient $http): array
    {
        $boards = new BoardRepository(
            new JiraClient(
                $http,
                'https://jira.example.test',
                'user@example.com',
                'token'
            ),
            new AdfDocumentFactory()
        );
        $cache = new ArrayAdapter();
        $snapshots = new BoardSnapshotProvider(
            $boards,
            $cache,
            new JiraViewMapper('customfield_10016', 'customfield_10026')
        );
        $users = new UserRepository(new JiraClient(
            new MockHttpClient(),
            'https://jira.example.test',
            'user@example.com',
            'token'
        ));
        $issues = new IssueRepository(
            new JiraClient(
                $http,
                'https://jira.example.test',
                'user@example.com',
                'token'
            ),
            new AdfDocumentFactory()
        );
        $translator = new Translator('fr');
        $handler = new JiraApiRequestHandler(
            $boards,
            $issues,
            $users,
            $snapshots,
            $cache,
            new AdfDocumentFactory(),
            $translator,
            new NullLogger(),
            Validation::createValidatorBuilder()->enableAttributeMapping()->getValidator()
        );

        return [$issues, $users, $snapshots, $handler];
    }
}
