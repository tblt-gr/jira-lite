<?php

declare(strict_types=1);

namespace App\Board;

use App\Jira\JiraViewMapper;
use App\Service\JiraApiService;

use const DATE_ATOM;

use DateTimeImmutable;

use function is_array;
use function sprintf;

use Symfony\Contracts\Cache\CacheInterface;
use Symfony\Contracts\Cache\ItemInterface;

final class BoardSnapshotProvider
{
    public function __construct(
        private readonly JiraApiService $jira,
        private readonly CacheInterface $cache,
        private readonly JiraViewMapper $mapper,
    ) {
    }

    /** @return array<string, mixed> */
    public function getSnapshot(int $boardId): array
    {
        return [
            'board' => $this->cache->get(
                sprintf('jira.board.%d', $boardId),
                function (ItemInterface $item) use ($boardId): array {
                    $item->expiresAfter(300);

                    return $this->jira->getBoard($boardId);
                }
            ),
            'configuration' => $this->cache->get(
                sprintf('jira.board.%d.configuration', $boardId),
                function (ItemInterface $item) use ($boardId): array {
                    $item->expiresAfter(300);

                    return $this->jira->getBoardConfiguration($boardId);
                }
            ),
            'epics' => $this->cache->get(
                sprintf('jira.board.%d.epics', $boardId),
                function (ItemInterface $item) use ($boardId): array {
                    $item->expiresAfter(300);

                    return $this->jira->getBoardEpics($boardId);
                }
            ),
            'issues' => $this->cache->get(
                $this->issuesCacheKey($boardId),
                function (ItemInterface $item) use ($boardId): array {
                    $item->expiresAfter(60);
                    $issues = $this->mapper->boardIssues(
                        $this->jira->getBoardIssues($boardId)
                    );
                    $issues['snapshotAt'] =
                        (new DateTimeImmutable())->format(DATE_ATOM);

                    return $issues;
                }
            ),
        ];
    }

    /**
     * @return array{cursor: string, issues: list<array<string, mixed>>, removed: list<string>}
     */
    public function getChanges(int $boardId, DateTimeImmutable $since): array
    {
        $response = $this->jira->getBoardIssueChanges($boardId, $since);
        $issues = is_array($response['issues'] ?? null)
            ? $response['issues']
            : [];
        $active = [];
        $removed = [];

        foreach ($issues as $issue) {
            if (!is_array($issue) || !isset($issue['key'])) {
                continue;
            }

            if ($this->isInActiveSprint($issue)) {
                $active[] = $this->mapper->boardIssue(
                    $issue,
                    is_array($response['names'] ?? null)
                        ? $response['names']
                        : []
                );
            } else {
                $removed[] = (string) $issue['key'];
            }
        }

        return [
            'cursor' => (new DateTimeImmutable())->format(DATE_ATOM),
            'issues' => $active,
            'removed' => array_values(array_unique($removed)),
        ];
    }

    public function invalidateIssues(int $boardId): void
    {
        $this->cache->delete($this->issuesCacheKey($boardId));
    }

    private function issuesCacheKey(int $boardId): string
    {
        return sprintf('jira.board.%d.issues', $boardId);
    }

    private function isInActiveSprint(array $issue): bool
    {
        $fields = is_array($issue['fields'] ?? null)
            ? $issue['fields']
            : [];

        foreach ($fields as $field => $value) {
            if (
                !str_contains(strtolower((string) $field), 'sprint')
                || !is_array($value)
            ) {
                continue;
            }

            $sprints = isset($value['state']) ? [$value] : $value;

            foreach ($sprints as $sprint) {
                if (
                    is_array($sprint)
                    && 'active'
                        === strtolower((string) ($sprint['state'] ?? ''))
                ) {
                    return true;
                }
            }
        }

        return false;
    }
}
