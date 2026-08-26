<?php

declare(strict_types=1);

namespace App\Jira\Repository;

use App\Jira\Document\AdfDocumentFactory;
use App\Jira\JiraClient;

use function count;

use DateTimeImmutable;
use DateTimeZone;
use InvalidArgumentException;

use function is_array;
use function sprintf;

final class BoardRepository
{
    private const PAGE_SIZE = 100;

    public function __construct(
        private readonly JiraClient $client,
        private readonly AdfDocumentFactory $documents,
    ) {
    }

    /** @return array<string, mixed> */
    public function getBoard(int $boardId): array
    {
        return $this->client->request('GET', sprintf('/rest/agile/1.0/board/%d', $boardId));
    }

    /** @return list<array<string, mixed>> */
    public function getBoards(): array
    {
        $startAt = 0;
        $boards = [];
        do {
            $page = $this->client->request('GET', '/rest/agile/1.0/board', ['query' => ['startAt' => $startAt, 'maxResults' => self::PAGE_SIZE]]);
            $values = is_array($page['values'] ?? null) ? $page['values'] : [];
            foreach ($values as $board) {
                if (is_array($board) && isset($board['id'])) {
                    $boards[] = $board;
                }
            }
            $startAt += count($values);
            $total = isset($page['total']) ? (int) $page['total'] : null;
            $hasMore = !(bool) ($page['isLast'] ?? false) && [] !== $values && (null === $total || $startAt < $total);
        } while ($hasMore);

        return $boards;
    }

    /** @return array<string, mixed> */
    public function getBoardConfiguration(int $boardId): array
    {
        return $this->client->request('GET', sprintf('/rest/agile/1.0/board/%d/configuration', $boardId));
    }

    /** @return array<string, mixed> */
    public function getBoardIssues(int $boardId): array
    {
        return $this->client->getAllIssuePages(sprintf('/rest/agile/1.0/board/%d/issue', $boardId), 'sprint in openSprints() ORDER BY Rank ASC');
    }

    /** @return array<string, mixed> */
    public function getBoardIssueChanges(int $boardId, DateTimeImmutable $since): array
    {
        $since = $since->setTimezone(new DateTimeZone('UTC'))->modify('-2 minutes')->format('Y-m-d H:i');

        return $this->client->getAllIssuePages(sprintf('/rest/agile/1.0/board/%d/issue', $boardId), sprintf('updated >= "%s" ORDER BY updated ASC', $since));
    }

    /** @return array<string, mixed> */
    public function getBoardEpics(int $boardId): array
    {
        return $this->client->request('GET', sprintf('/rest/agile/1.0/board/%d/epic', $boardId), ['query' => ['startAt' => 0, 'maxResults' => self::PAGE_SIZE]]);
    }

    /** @return array{project: array{id: ?string, key: ?string, name: string}, issueTypes: list<array{id: string, name: string}>, sprints: list<array{id: string, name: string}>} */
    public function getBoardCreateMetadata(int $boardId): array
    {
        $board = $this->getBoard($boardId);
        $project = $this->boardProject($board);
        $reference = $project['key'] ?? $project['id'];
        $types = $this->client->request('GET', sprintf('/rest/api/3/issue/createmeta/%s/issuetypes', rawurlencode((string) $reference)), ['query' => ['startAt' => 0, 'maxResults' => self::PAGE_SIZE]]);
        $sprints = 'scrum' === strtolower((string) ($board['type'] ?? ''))
            ? $this->client->request('GET', sprintf('/rest/agile/1.0/board/%d/sprint', $boardId), ['query' => ['state' => 'active', 'startAt' => 0, 'maxResults' => self::PAGE_SIZE]])
            : [];

        return ['project' => $project, 'issueTypes' => $this->metadataValues($types, 'issueTypes', true), 'sprints' => $this->metadataValues($sprints, 'values')];
    }

    /** @return array<string, mixed> */
    public function createBoardIssue(int $boardId, string $issueTypeId, string $summary, ?string $description = null, ?string $sprintId = null, ?string $epicKey = null): array
    {
        $project = $this->boardProject($this->getBoard($boardId));
        $fields = ['project' => null !== $project['id'] ? ['id' => $project['id']] : ['key' => $project['key']], 'issuetype' => ['id' => $issueTypeId], 'summary' => $summary];
        if (null !== $description && '' !== $description) {
            $fields['description'] = $this->documents->plainTextDocument($description);
        }
        $created = $this->client->request('POST', '/rest/api/3/issue', ['json' => ['fields' => $fields]]);
        $issueKey = trim((string) ($created['key'] ?? ''));
        if ('' === $issueKey) {
            throw new InvalidArgumentException('Jira did not return the created issue key.');
        }
        if (null !== $epicKey) {
            $this->client->request('PUT', sprintf('/rest/api/3/issue/%s', rawurlencode($issueKey)), ['json' => ['fields' => ['parent' => ['key' => $epicKey]]]]);
        }
        if (null !== $sprintId) {
            $this->client->request('POST', sprintf('/rest/agile/1.0/sprint/%s/issue', rawurlencode($sprintId)), ['json' => ['issues' => [$issueKey]]]);
        }

        return $this->client->request('GET', sprintf('/rest/api/3/issue/%s', rawurlencode($issueKey)), ['query' => ['fields' => '*all', 'expand' => 'names']]);
    }

    /** @param array<string, mixed> $page
     * @return list<array{id: string, name: string}> */
    private function metadataValues(array $page, string $key, bool $excludeSubtasks = false): array
    {
        $result = [];
        foreach (is_array($page[$key] ?? null) ? $page[$key] : [] as $value) {
            if (!is_array($value) || !isset($value['id'], $value['name']) || ($excludeSubtasks && (bool) ($value['subtask'] ?? false))) {
                continue;
            }
            $result[] = ['id' => (string) $value['id'], 'name' => (string) $value['name']];
        }

        return $result;
    }

    /** @param array<string, mixed> $board
     * @return array{id: ?string, key: ?string, name: string} */
    private function boardProject(array $board): array
    {
        $location = is_array($board['location'] ?? null) ? $board['location'] : [];
        $id = trim((string) ($location['projectId'] ?? ''));
        $key = trim((string) ($location['projectKey'] ?? ''));
        if ('' === $id && '' === $key) {
            throw new InvalidArgumentException('The Jira board is not associated with a project.');
        }

        return ['id' => '' === $id ? null : $id, 'key' => '' === $key ? null : $key, 'name' => trim((string) ($location['projectName'] ?? $location['displayName'] ?? $key))];
    }
}
