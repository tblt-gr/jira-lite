<?php

declare(strict_types=1);

namespace App\Jira;

use function count;
use function is_array;

use const PHP_URL_PATH;

use Psr\Log\LoggerInterface;
use Psr\Log\NullLogger;
use Symfony\Contracts\HttpClient\Exception\ExceptionInterface;
use Symfony\Contracts\HttpClient\Exception\HttpExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;
use Symfony\Contracts\HttpClient\ResponseInterface;

final class JiraClient
{
    private const PAGE_SIZE = 100;

    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly string $baseUrl,
        private readonly string $email,
        private readonly string $apiToken,
        private readonly LoggerInterface $logger = new NullLogger(),
    ) {
    }

    /**
     * @param array<string, mixed> $options
     *
     * @return array<string, mixed>
     */
    public function request(
        string $method,
        string $uri,
        array $options = [],
    ): array {
        try {
            $startedAt = microtime(true);
            $response = $this->httpClient->request(
                $method,
                rtrim($this->baseUrl, '/').$uri,
                array_merge_recursive(
                    [
                        'auth_basic' => [$this->email, $this->apiToken],
                        'headers' => [
                            'Accept' => 'application/json',
                            'Content-Type' => 'application/json',
                        ],
                    ],
                    $options
                )
            );

            $payload = $this->decode($response);
            $this->logger->debug('Jira API request completed.', [
                'method' => $method,
                'path' => parse_url($uri, PHP_URL_PATH) ?: '/',
                'status' => $response->getStatusCode(),
                'duration_ms' => (int) ((microtime(true) - $startedAt) * 1000),
            ]);

            return $payload;
        } catch (ExceptionInterface $exception) {
            $status = $exception instanceof HttpExceptionInterface
                ? $exception->getResponse()->getStatusCode()
                : null;
            $this->logger->debug('Jira API request failed.', [
                'method' => $method,
                'path' => parse_url($uri, PHP_URL_PATH) ?: '/',
                'status' => $status,
            ]);

            throw new JiraException($status, $exception);
        }
    }

    /** @return array<string, mixed> */
    public function getAllIssuePages(string $uri, string $jql): array
    {
        $startAt = 0;
        $issues = [];
        $lastPage = [];

        do {
            $lastPage = $this->request('GET', $uri, [
                'query' => [
                    'startAt' => $startAt,
                    'maxResults' => self::PAGE_SIZE,
                    'jql' => $jql,
                    'expand' => 'names',
                ],
            ]);
            $pageIssues = is_array($lastPage['issues'] ?? null)
                ? $lastPage['issues']
                : [];
            array_push($issues, ...$pageIssues);
            $startAt += count($pageIssues);

            if (isset($lastPage['total'])) {
                $hasMore = $startAt < (int) $lastPage['total'];
            } else {
                $pageSize = (int) (
                    $lastPage['maxResults'] ?? self::PAGE_SIZE
                );
                $hasMore = count($pageIssues) >= $pageSize;
            }
        } while ([] !== $pageIssues && $hasMore);

        $lastPage['issues'] = $issues;
        $lastPage['startAt'] = 0;
        $lastPage['maxResults'] = count($issues);
        $lastPage['total'] = count($issues);
        $this->logger->info('Jira issue pages fetched.', [
            'path' => parse_url($uri, PHP_URL_PATH) ?: '/',
            'pages' => (int) ceil(count($issues) / self::PAGE_SIZE),
        ]);

        return $lastPage;
    }

    public function isAvailable(): bool
    {
        try {
            $this->request('GET', '/rest/api/3/myself', [
                'timeout' => 2,
            ]);

            return true;
        } catch (JiraException) {
            return false;
        }
    }

    /** @return array<string, mixed> */
    private function decode(ResponseInterface $response): array
    {
        if (204 === $response->getStatusCode()) {
            return [];
        }

        return $response->toArray();
    }
}
