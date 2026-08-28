<?php

declare(strict_types=1);

namespace App\Demo;

use function count;

use const DATE_ATOM;

use DateTimeImmutable;

use function in_array;
use function sprintf;

use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

final class DemoDataProvider
{
    public const POPULATED_BOARD_ID = 9001;
    public const EMPTY_BOARD_ID = 9002;

    /** @return list<array<string, mixed>> */
    public function boards(): array
    {
        return [
            $this->boardDefinition(self::POPULATED_BOARD_ID),
            $this->boardDefinition(self::EMPTY_BOARD_ID),
        ];
    }

    /** @return array<string, mixed> */
    public function snapshot(int $boardId): array
    {
        $this->assertBoardExists($boardId);

        $issues = self::POPULATED_BOARD_ID === $boardId
            ? $this->boardIssues()
            : [];

        return [
            'board' => $this->boardDefinition($boardId),
            'configuration' => [
                'id' => $boardId,
                'name' => self::POPULATED_BOARD_ID === $boardId
                    ? 'Nimbus Product Board'
                    : 'Nimbus Empty Board',
                'columnConfig' => ['columns' => $this->columns()],
            ],
            'epics' => [
                'startAt' => 0,
                'maxResults' => count($issues) > 0 ? 2 : 0,
                'total' => count($issues) > 0 ? 2 : 0,
                'isLast' => true,
                'values' => count($issues) > 0 ? $this->epics() : [],
            ],
            'issues' => [
                'startAt' => 0,
                'maxResults' => count($issues),
                'total' => count($issues),
                'issues' => $issues,
                'names' => [
                    'customfield_10016' => 'Story Points',
                    'sprint' => 'Sprint',
                    'epic' => 'Epic Link',
                ],
                'snapshotAt' => '2026-08-28T10:00:00+02:00',
            ],
        ];
    }

    /** @return array{cursor: string, issues: list<array<string, mixed>>, removed: list<string>} */
    public function changes(int $boardId): array
    {
        $this->assertBoardExists($boardId);

        return [
            'cursor' => (new DateTimeImmutable())->format(DATE_ATOM),
            'issues' => [],
            'removed' => [],
        ];
    }

    /** @return array<string, mixed> */
    public function issue(string $issueKey): array
    {
        foreach ($this->issueDefinitions() as $issue) {
            if ($issueKey !== $issue['key']) {
                continue;
            }

            return $this->detailedIssue($issue);
        }

        throw new NotFoundHttpException(sprintf('Unknown demo issue "%s".', $issueKey));
    }

    /** @return array{transitions: list<never>} */
    public function transitions(string $issueKey): array
    {
        $this->issue($issueKey);

        return ['transitions' => []];
    }

    /** @return array<string, mixed> */
    public function comments(string $issueKey): array
    {
        $this->issue($issueKey);
        $comments = $this->commentsByIssue()[$issueKey] ?? [];

        return [
            'startAt' => 0,
            'maxResults' => count($comments),
            'total' => count($comments),
            'comments' => $comments,
            'currentUser' => null,
        ];
    }

    /**
     * @return list<array{accountId: string, displayName: string, avatarUrl: null}>
     */
    public function users(string $query): array
    {
        $query = mb_strtolower(trim($query));

        if ('' === $query || mb_strlen($query) > 80) {
            return [];
        }

        return array_values(array_filter(
            array_map(
                static fn (array $user): array => [
                    'accountId' => $user['accountId'],
                    'displayName' => $user['displayName'],
                    'avatarUrl' => null,
                ],
                $this->usersCatalog(),
            ),
            static fn (array $user): bool => str_contains(
                mb_strtolower($user['displayName']),
                $query,
            ),
        ));
    }

    /** @return array<string, mixed> */
    private function boardDefinition(int $boardId): array
    {
        $this->assertBoardExists($boardId);
        $populated = self::POPULATED_BOARD_ID === $boardId;

        return [
            'id' => $boardId,
            'name' => $populated
                ? 'Nimbus Product Board'
                : 'Nimbus Empty Board',
            'type' => 'scrum',
            'location' => [
                'projectId' => '10001',
                'projectKey' => 'NIM',
                'projectName' => 'Nimbus',
                'displayName' => $populated
                    ? 'Nimbus Product'
                    : 'Nimbus Sandbox',
            ],
        ];
    }

    private function assertBoardExists(int $boardId): void
    {
        if (!in_array($boardId, [
            self::POPULATED_BOARD_ID,
            self::EMPTY_BOARD_ID,
        ], true)) {
            throw new NotFoundHttpException(sprintf('Unknown demo board "%d".', $boardId));
        }
    }

    /** @return list<array<string, mixed>> */
    private function columns(): array
    {
        return [
            [
                'name' => 'To Do',
                'statuses' => [[
                    'id' => '10000',
                    'name' => 'To Do',
                    'statusCategory' => ['key' => 'new', 'name' => 'To Do'],
                ]],
            ],
            [
                'name' => 'In Progress',
                'statuses' => [[
                    'id' => '10001',
                    'name' => 'In Progress',
                    'statusCategory' => [
                        'key' => 'indeterminate',
                        'name' => 'In Progress',
                    ],
                ]],
            ],
            [
                'name' => 'Review',
                'statuses' => [[
                    'id' => '10002',
                    'name' => 'Review',
                    'statusCategory' => [
                        'key' => 'indeterminate',
                        'name' => 'In Progress',
                    ],
                ]],
            ],
            [
                'name' => 'Done',
                'statuses' => [[
                    'id' => '10003',
                    'name' => 'Done',
                    'statusCategory' => ['key' => 'done', 'name' => 'Done'],
                ]],
            ],
        ];
    }

    /** @return list<array<string, mixed>> */
    private function epics(): array
    {
        return [
            [
                'id' => '10010',
                'key' => 'NIM-100',
                'name' => 'Streamline team onboarding',
                'summary' => 'Streamline team onboarding',
                'color' => ['key' => 'color_7'],
                'done' => false,
            ],
            [
                'id' => '10011',
                'key' => 'NIM-101',
                'name' => 'Improve workspace insights',
                'summary' => 'Improve workspace insights',
                'color' => ['key' => 'color_9'],
                'done' => false,
            ],
        ];
    }

    /** @return list<array<string, mixed>> */
    private function usersCatalog(): array
    {
        return [
            [
                'accountId' => 'demo-maya',
                'displayName' => 'Maya Chen',
                'emailAddress' => 'maya.chen@example.test',
                'active' => true,
            ],
            [
                'accountId' => 'demo-noah',
                'displayName' => 'Noah Williams',
                'emailAddress' => 'noah.williams@example.test',
                'active' => true,
            ],
            [
                'accountId' => 'demo-sofia',
                'displayName' => 'Sofia Rossi',
                'emailAddress' => 'sofia.rossi@example.test',
                'active' => true,
            ],
        ];
    }

    /** @return list<array<string, mixed>> */
    private function issueDefinitions(): array
    {
        return [
            $this->issueDefinition(
                '121',
                'NIM-121',
                'Design guided workspace setup',
                '10001',
                'Story',
                'Medium',
                'demo-maya',
                '10010',
                5,
                ['onboarding', 'ux'],
                'Create a guided setup that helps new teams configure their first workspace.',
            ),
            $this->issueDefinition(
                '122',
                'NIM-122',
                'Add invite-by-link flow',
                '10002',
                'Story',
                'High',
                'demo-noah',
                '10010',
                3,
                ['onboarding', 'frontend'],
                'Let workspace owners share a secure invitation link with their teammates.',
            ),
            $this->issueDefinition(
                '123',
                'NIM-123',
                'Create welcome checklist',
                '10003',
                'Task',
                'Medium',
                'demo-sofia',
                '10010',
                2,
                ['onboarding'],
                'Show a concise checklist with the key actions required to finish setup.',
            ),
            $this->issueDefinition(
                '124',
                'NIM-124',
                'Track onboarding completion',
                '10000',
                'Story',
                'Medium',
                'demo-sofia',
                '10010',
                5,
                ['analytics', 'onboarding'],
                'Record onboarding milestones so the product team can measure activation.',
            ),
            $this->issueDefinition(
                '125',
                'NIM-125',
                'Build activity trend chart',
                '10001',
                'Story',
                'Highest',
                'demo-noah',
                '10011',
                8,
                ['analytics', 'frontend'],
                'Visualize weekly workspace activity with a responsive trend chart.',
            ),
            $this->issueDefinition(
                '126',
                'NIM-126',
                'Add date-range presets',
                '10003',
                'Task',
                'Low',
                'demo-maya',
                '10011',
                3,
                ['analytics', 'ux'],
                'Add quick filters for the last 7, 30 and 90 days.',
            ),
            $this->issueDefinition(
                '127',
                'NIM-127',
                'Export dashboard as CSV',
                '10000',
                'Story',
                'Medium',
                'demo-sofia',
                '10011',
                5,
                ['analytics', 'export'],
                'Allow workspace admins to export the current dashboard data as CSV.',
            ),
            $this->issueDefinition(
                '128',
                'NIM-128',
                'Fix timezone grouping in reports',
                '10002',
                'Bug',
                'High',
                'demo-noah',
                '10011',
                3,
                ['analytics', 'bug'],
                'Group activity by the workspace timezone instead of UTC.',
            ),
        ];
    }

    /**
     * @param list<string> $labels
     *
     * @return array<string, mixed>
     */
    private function issueDefinition(
        string $id,
        string $key,
        string $summary,
        string $statusId,
        string $type,
        string $priority,
        string $assigneeId,
        string $epicId,
        int $storyPoints,
        array $labels,
        string $description,
    ): array {
        $status = $this->status($statusId);
        $epic = $this->epic($epicId);

        return [
            'id' => $id,
            'key' => $key,
            'fields' => [
                'summary' => $summary,
                'status' => $status,
                'statusCategory' => $status['statusCategory'],
                'issuetype' => $this->issueType($type),
                'priority' => ['id' => strtolower($priority), 'name' => $priority],
                'labels' => $labels,
                'assignee' => $this->user($assigneeId),
                'fixVersions' => [[
                    'id' => '20001',
                    'name' => 'Nimbus 2.4',
                ]],
                'sprint' => [
                    'id' => 30001,
                    'name' => 'Nimbus Sprint 12',
                    'state' => 'active',
                    'startDate' => '2026-08-17T09:00:00.000+02:00',
                    'endDate' => '2026-08-28T18:00:00.000+02:00',
                ],
                'epic' => $epic,
                'customfield_10016' => $storyPoints,
                '_demoDescription' => $description,
            ],
        ];
    }

    /** @param array<string, mixed> $issue
     * @return array<string, mixed>
     */
    private function detailedIssue(array $issue): array
    {
        $fields = $issue['fields'];
        $description = (string) $fields['_demoDescription'];
        unset($fields['_demoDescription']);
        $fields['description'] = $this->document($description);
        $fields['project'] = [
            'id' => '10001',
            'key' => 'NIM',
            'name' => 'Nimbus',
        ];
        $fields['reporter'] = $this->user('demo-maya');
        $fields['creator'] = $this->user('demo-maya');
        $fields['components'] = [['id' => '40001', 'name' => 'Web app']];
        $fields['versions'] = [];
        $fields['created'] = '2026-08-18T09:30:00.000+0200';
        $fields['updated'] = '2026-08-27T16:45:00.000+0200';
        $fields['duedate'] = '2026-09-04';
        $fields['timetracking'] = [
            'originalEstimate' => '2d',
            'remainingEstimate' => '6h',
            'timeSpent' => '1d 2h',
            'originalEstimateSeconds' => 57_600,
            'remainingEstimateSeconds' => 21_600,
            'timeSpentSeconds' => 36_000,
        ];
        $fields['votes'] = ['votes' => 3];
        $fields['watches'] = ['watchCount' => 5, 'isWatching' => false];
        $fields['subtasks'] = [];
        $fields['attachment'] = [];

        return [
            'id' => $issue['id'],
            'key' => $issue['key'],
            'fields' => $fields,
            'names' => [
                'customfield_10016' => 'Story Points',
                'sprint' => 'Sprint',
                'epic' => 'Epic Link',
            ],
        ];
    }

    /** @return list<array<string, mixed>> */
    private function boardIssues(): array
    {
        return array_map(static function (array $issue): array {
            unset($issue['fields']['_demoDescription']);

            return $issue;
        }, $this->issueDefinitions());
    }

    /** @return array<string, mixed> */
    private function status(string $statusId): array
    {
        foreach ($this->columns() as $column) {
            foreach ($column['statuses'] as $status) {
                if ($statusId === $status['id']) {
                    return $status;
                }
            }
        }

        throw new NotFoundHttpException(sprintf('Unknown demo status "%s".', $statusId));
    }

    /** @return array<string, mixed> */
    private function epic(string $epicId): array
    {
        foreach ($this->epics() as $epic) {
            if ($epicId === $epic['id']) {
                return $epic;
            }
        }

        throw new NotFoundHttpException(sprintf('Unknown demo epic "%s".', $epicId));
    }

    /** @return array<string, mixed> */
    private function user(string $accountId): array
    {
        foreach ($this->usersCatalog() as $user) {
            if ($accountId === $user['accountId']) {
                return $user;
            }
        }

        throw new NotFoundHttpException(sprintf('Unknown demo user "%s".', $accountId));
    }

    /** @return array{id: string, name: string, subtask: false} */
    private function issueType(string $name): array
    {
        return [
            'id' => match ($name) {
                'Bug' => '10004',
                'Task' => '10003',
                default => '10001',
            },
            'name' => $name,
            'subtask' => false,
        ];
    }

    /** @return array{type: string, version: int, content: list<array<string, mixed>>} */
    private function document(string $text): array
    {
        return [
            'type' => 'doc',
            'version' => 1,
            'content' => [[
                'type' => 'paragraph',
                'content' => [['type' => 'text', 'text' => $text]],
            ]],
        ];
    }

    /** @return array<string, list<array<string, mixed>>> */
    private function commentsByIssue(): array
    {
        return [
            'NIM-121' => [
                $this->comment(
                    '50001',
                    'demo-noah',
                    'The prototype looks clear. I can start with the workspace step.',
                    '2026-08-25T10:15:00.000+0200',
                ),
                $this->comment(
                    '50002',
                    'demo-maya',
                    'Great, I added the mobile states and the validation copy.',
                    '2026-08-26T14:40:00.000+0200',
                ),
            ],
            'NIM-125' => [
                $this->comment(
                    '50003',
                    'demo-sofia',
                    'The aggregation endpoint is ready with daily and weekly buckets.',
                    '2026-08-27T09:20:00.000+0200',
                ),
            ],
            'NIM-128' => [
                $this->comment(
                    '50004',
                    'demo-maya',
                    'Confirmed in the Europe/Paris and America/New_York workspaces.',
                    '2026-08-27T16:10:00.000+0200',
                ),
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function comment(
        string $id,
        string $authorId,
        string $body,
        string $created,
    ): array {
        return [
            'id' => $id,
            'author' => $this->user($authorId),
            'body' => $this->document($body),
            'created' => $created,
            'updated' => $created,
        ];
    }
}
