<?php

declare(strict_types=1);

namespace App\Tests\Jira;

use App\Jira\JiraClient;

use const JSON_THROW_ON_ERROR;

use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;

final class JiraClientTest extends TestCase
{
    public function testItPaginatesBoardIssues(): void
    {
        $requests = 0;
        $http = new MockHttpClient(static function () use (&$requests): MockResponse {
            ++$requests;

            return new MockResponse(json_encode([
                'issues' => [['key' => 'APP-'.$requests]],
                'total' => 2,
                'names' => ['customfield_1' => 'Epic Link'],
            ], JSON_THROW_ON_ERROR));
        });
        $client = new JiraClient(
            $http,
            'https://example.atlassian.net',
            'user@example.com',
            'token'
        );

        $result = $client->getAllIssuePages('/rest/agile/1.0/board/1/issue', '');

        self::assertSame(2, $requests);
        self::assertSame(['APP-1', 'APP-2'], array_column(
            $result['issues'],
            'key'
        ));
        self::assertSame(2, $result['total']);
    }
}
