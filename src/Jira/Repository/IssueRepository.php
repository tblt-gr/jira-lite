<?php

declare(strict_types=1);

namespace App\Jira\Repository;

use App\Jira\Document\AdfDocumentFactory;
use App\Jira\JiraClient;

use function count;
use function is_array;
use function sprintf;

final class IssueRepository
{
    private const PAGE_SIZE = 100;

    public function __construct(
        private readonly JiraClient $client,
        private readonly AdfDocumentFactory $documents,
    ) {
    }

    /** @return array<string, mixed> */
    public function getIssue(string $issueKey): array
    {
        return $this->client->request(
            'GET',
            sprintf('/rest/api/3/issue/%s', rawurlencode($issueKey)),
            ['query' => ['fields' => '*all', 'expand' => 'names']]
        );
    }

    /** @return array<string, mixed> */
    public function getTransitions(string $issueKey): array
    {
        return $this->client->request(
            'GET',
            sprintf('/rest/api/3/issue/%s/transitions', rawurlencode($issueKey))
        );
    }

    /** @return array<string, mixed> */
    public function getIssueComments(string $issueKey): array
    {
        $startAt = 0;
        $comments = [];

        do {
            $page = $this->client->request(
                'GET',
                sprintf('/rest/api/3/issue/%s/comment', rawurlencode($issueKey)),
                ['query' => [
                    'startAt' => $startAt,
                    'maxResults' => self::PAGE_SIZE,
                    'orderBy' => 'created',
                ]]
            );
            $pageComments = is_array($page['comments'] ?? null)
                ? $page['comments']
                : [];

            foreach ($pageComments as $comment) {
                if (is_array($comment)) {
                    $comments[] = $comment;
                }
            }

            $startAt += count($pageComments);
            $total = (int) ($page['total'] ?? $startAt);
        } while ([] !== $pageComments && $startAt < $total);

        return [
            'startAt' => 0,
            'maxResults' => count($comments),
            'total' => count($comments),
            'comments' => $comments,
        ];
    }

    /** @param array<string, mixed> $fields */
    public function updateIssue(string $issueKey, array $fields): void
    {
        $this->client->request(
            'PUT',
            sprintf('/rest/api/3/issue/%s', rawurlencode($issueKey)),
            ['json' => ['fields' => $fields]]
        );
    }

    /**
     * @param list<array{accountId: string, text: string}> $mentions
     *
     * @return array<string, mixed>
     */
    public function addIssueComment(
        string $issueKey,
        string $comment,
        array $mentions = [],
    ): array {
        return $this->commentRequest(
            'POST',
            $issueKey,
            null,
            $comment,
            $mentions
        );
    }

    /**
     * @param list<array{accountId: string, text: string}> $mentions
     *
     * @return array<string, mixed>
     */
    public function updateIssueComment(
        string $issueKey,
        string $commentId,
        string $comment,
        array $mentions = [],
    ): array {
        return $this->commentRequest(
            'PUT',
            $issueKey,
            $commentId,
            $comment,
            $mentions
        );
    }

    public function deleteIssueComment(string $issueKey, string $commentId): void
    {
        $this->client->request(
            'DELETE',
            $this->commentUri($issueKey, $commentId)
        );
    }

    /** @return array<string, mixed> */
    public function addIssueWorklog(
        string $issueKey,
        string $timeSpent,
        ?string $comment = null,
        ?string $started = null,
    ): array {
        $payload = ['timeSpent' => $timeSpent];

        if (null !== $started && '' !== $started) {
            $payload['started'] = $started;
        }

        if (null !== $comment && '' !== $comment) {
            $payload['comment'] = $this->documents->plainTextDocument($comment);
        }

        return $this->client->request(
            'POST',
            sprintf('/rest/api/3/issue/%s/worklog', rawurlencode($issueKey)),
            ['query' => ['adjustEstimate' => 'auto'], 'json' => $payload]
        );
    }

    public function transitionIssue(string $issueKey, string $transitionId): void
    {
        $this->client->request(
            'POST',
            sprintf('/rest/api/3/issue/%s/transitions', rawurlencode($issueKey)),
            ['json' => ['transition' => ['id' => $transitionId]]]
        );
    }

    /**
     * @param list<array{accountId: string, text: string}> $mentions
     *
     * @return array<string, mixed>
     */
    private function commentRequest(
        string $method,
        string $issueKey,
        ?string $commentId,
        string $comment,
        array $mentions,
    ): array {
        return $this->client->request(
            $method,
            $this->commentUri($issueKey, $commentId),
            ['json' => [
                'body' => $this->documents->plainTextDocument($comment, $mentions),
            ]]
        );
    }

    private function commentUri(string $issueKey, ?string $commentId = null): string
    {
        $uri = sprintf('/rest/api/3/issue/%s/comment', rawurlencode($issueKey));

        return null === $commentId
            ? $uri
            : $uri.'/'.rawurlencode($commentId);
    }
}
