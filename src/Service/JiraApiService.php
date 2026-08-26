<?php

declare(strict_types=1);

namespace App\Service;

use App\Jira\JiraClient;
use App\Jira\JiraMediaProxy;

use function count;

use DateTimeImmutable;
use DateTimeZone;
use InvalidArgumentException;

use function is_array;
use function sprintf;
use function strlen;

final class JiraApiService
{
    private const PAGE_SIZE = 100;

    public function __construct(
        private readonly JiraClient $client,
        private readonly JiraMediaProxy $media,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function getBoard(int $boardId): array
    {
        return $this->client->request(
            'GET',
            sprintf('/rest/agile/1.0/board/%d', $boardId)
        );
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function getBoards(): array
    {
        $startAt = 0;
        $boards = [];

        do {
            $page = $this->client->request('GET', '/rest/agile/1.0/board', [
                'query' => [
                    'startAt' => $startAt,
                    'maxResults' => self::PAGE_SIZE,
                ],
            ]);
            $values = is_array($page['values'] ?? null)
                ? $page['values']
                : [];

            foreach ($values as $board) {
                if (is_array($board) && isset($board['id'])) {
                    $boards[] = $board;
                }
            }

            $startAt += count($values);
            $isLast = (bool) ($page['isLast'] ?? false);
            $total = isset($page['total']) ? (int) $page['total'] : null;
            $hasMore = !$isLast
                && [] !== $values
                && (null === $total || $startAt < $total);
        } while ($hasMore);

        return $boards;
    }

    /**
     * @return array<string, mixed>
     */
    public function getBoardConfiguration(int $boardId): array
    {
        return $this->client->request(
            'GET',
            sprintf('/rest/agile/1.0/board/%d/configuration', $boardId)
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function getBoardIssues(int $boardId): array
    {
        return $this->client->getAllIssuePages(
            sprintf('/rest/agile/1.0/board/%d/issue', $boardId),
            'sprint in openSprints() ORDER BY Rank ASC'
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function getBoardIssueChanges(
        int $boardId,
        DateTimeImmutable $since,
    ): array {
        $jiraSince = $since
            ->setTimezone(new DateTimeZone('UTC'))
            ->modify('-2 minutes')
            ->format('Y-m-d H:i');

        return $this->client->getAllIssuePages(
            sprintf('/rest/agile/1.0/board/%d/issue', $boardId),
            sprintf(
                'updated >= "%s" ORDER BY updated ASC',
                $jiraSince
            )
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function getBoardEpics(int $boardId): array
    {
        return $this->client->request(
            'GET',
            sprintf('/rest/agile/1.0/board/%d/epic', $boardId),
            [
                'query' => [
                    'startAt' => 0,
                    'maxResults' => 100,
                ],
            ]
        );
    }

    /**
     * @return array{
     *     project: array{id: ?string, key: ?string, name: string},
     *     issueTypes: list<array{id: string, name: string}>,
     *     sprints: list<array{id: string, name: string}>
     * }
     */
    public function getBoardCreateMetadata(int $boardId): array
    {
        $board = $this->getBoard($boardId);
        $project = $this->boardProject($board);
        $reference = $project['key'] ?? $project['id'];
        $issueTypePage = $this->client->request(
            'GET',
            sprintf(
                '/rest/api/3/issue/createmeta/%s/issuetypes',
                rawurlencode((string) $reference)
            ),
            [
                'query' => [
                    'startAt' => 0,
                    'maxResults' => self::PAGE_SIZE,
                ],
            ]
        );
        $sprintPage = [];

        if ('scrum' === strtolower((string) ($board['type'] ?? ''))) {
            $sprintPage = $this->client->request(
                'GET',
                sprintf('/rest/agile/1.0/board/%d/sprint', $boardId),
                [
                    'query' => [
                        'state' => 'active',
                        'startAt' => 0,
                        'maxResults' => self::PAGE_SIZE,
                    ],
                ]
            );
        }
        $issueTypes = [];

        $issueTypeValues = is_array($issueTypePage['issueTypes'] ?? null)
            ? $issueTypePage['issueTypes']
            : [];

        foreach ($issueTypeValues as $issueType) {
            if (
                !is_array($issueType)
                || (bool) ($issueType['subtask'] ?? false)
                || !isset($issueType['id'], $issueType['name'])
            ) {
                continue;
            }

            $issueTypes[] = [
                'id' => (string) $issueType['id'],
                'name' => (string) $issueType['name'],
            ];
        }

        $sprints = [];

        $sprintValues = is_array($sprintPage['values'] ?? null)
            ? $sprintPage['values']
            : [];

        foreach ($sprintValues as $sprint) {
            if (
                !is_array($sprint)
                || !isset($sprint['id'], $sprint['name'])
            ) {
                continue;
            }

            $sprints[] = [
                'id' => (string) $sprint['id'],
                'name' => (string) $sprint['name'],
            ];
        }

        return [
            'project' => [
                'id' => $project['id'],
                'key' => $project['key'],
                'name' => $project['name'],
            ],
            'issueTypes' => $issueTypes,
            'sprints' => $sprints,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function createBoardIssue(
        int $boardId,
        string $issueTypeId,
        string $summary,
        ?string $description = null,
        ?string $sprintId = null,
        ?string $epicKey = null,
    ): array {
        $project = $this->boardProject($this->getBoard($boardId));
        /** @var array<string, mixed> $fields */
        $fields = [
            'project' => null !== $project['id']
                ? ['id' => $project['id']]
                : ['key' => $project['key']],
            'issuetype' => ['id' => $issueTypeId],
            'summary' => $summary,
        ];

        if (null !== $description && '' !== $description) {
            $fields['description'] = $this->plainTextDocument($description);
        }

        $created = $this->client->request(
            'POST',
            '/rest/api/3/issue',
            ['json' => ['fields' => $fields]]
        );
        $issueKey = trim((string) ($created['key'] ?? ''));

        if ('' === $issueKey) {
            throw new InvalidArgumentException('Jira did not return the created issue key.');
        }

        if (null !== $epicKey) {
            $this->client->request(
                'PUT',
                sprintf('/rest/api/3/issue/%s', rawurlencode($issueKey)),
                [
                    'json' => [
                        'fields' => [
                            'parent' => ['key' => $epicKey],
                        ],
                    ],
                ]
            );
        }

        if (null !== $sprintId) {
            $this->client->request(
                'POST',
                sprintf(
                    '/rest/agile/1.0/sprint/%s/issue',
                    rawurlencode($sprintId)
                ),
                ['json' => ['issues' => [$issueKey]]]
            );
        }

        return $this->getIssue($issueKey);
    }

    /**
     * @return array<string, mixed>
     */
    public function getIssue(string $issueKey): array
    {
        return $this->client->request(
            'GET',
            sprintf('/rest/api/3/issue/%s', rawurlencode($issueKey)),
            [
                'query' => [
                    'fields' => '*all',
                    'expand' => 'names',
                ],
            ]
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function getTransitions(string $issueKey): array
    {
        return $this->client->request(
            'GET',
            sprintf('/rest/api/3/issue/%s/transitions', rawurlencode($issueKey))
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function getIssueComments(string $issueKey): array
    {
        $startAt = 0;
        $comments = [];

        do {
            $page = $this->client->request(
                'GET',
                sprintf(
                    '/rest/api/3/issue/%s/comment',
                    rawurlencode($issueKey)
                ),
                [
                    'query' => [
                        'startAt' => $startAt,
                        'maxResults' => self::PAGE_SIZE,
                        'orderBy' => 'created',
                    ],
                ]
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

    /**
     * @return array<string, mixed>
     */
    public function getCurrentUser(): array
    {
        return $this->client->request('GET', '/rest/api/3/myself');
    }

    /**
     * @return list<array{accountId: string, displayName: string, avatarUrl: ?string}>
     */
    public function searchUsers(string $query): array
    {
        $response = $this->client->request('GET', '/rest/api/3/user/picker', [
            'query' => [
                'query' => $query,
                'maxResults' => 10,
                'showAvatar' => true,
                'excludeConnectUsers' => true,
            ],
        ]);
        $users = is_array($response['users'] ?? null)
            ? $response['users']
            : [];
        $result = [];

        foreach ($users as $user) {
            $accountId = trim((string) ($user['accountId'] ?? ''));
            $displayName = trim((string) ($user['displayName'] ?? ''));

            if ('' === $accountId || '' === $displayName) {
                continue;
            }

            $result[] = [
                'accountId' => $accountId,
                'displayName' => $displayName,
                'avatarUrl' => isset($user['avatarUrl'])
                    ? (string) $user['avatarUrl']
                    : null,
            ];
        }

        return $result;
    }

    /**
     * @param array<string, mixed> $fields
     */
    public function updateIssue(string $issueKey, array $fields): void
    {
        $this->client->request(
            'PUT',
            sprintf('/rest/api/3/issue/%s', rawurlencode($issueKey)),
            [
                'json' => [
                    'fields' => $fields,
                ],
            ]
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
        return $this->client->request(
            'POST',
            sprintf(
                '/rest/api/3/issue/%s/comment',
                rawurlencode($issueKey)
            ),
            [
                'json' => [
                    'body' => $this->plainTextDocument($comment, $mentions),
                ],
            ]
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
        return $this->client->request(
            'PUT',
            sprintf(
                '/rest/api/3/issue/%s/comment/%s',
                rawurlencode($issueKey),
                rawurlencode($commentId)
            ),
            [
                'json' => [
                    'body' => $this->plainTextDocument($comment, $mentions),
                ],
            ]
        );
    }

    public function deleteIssueComment(
        string $issueKey,
        string $commentId,
    ): void {
        $this->client->request(
            'DELETE',
            sprintf(
                '/rest/api/3/issue/%s/comment/%s',
                rawurlencode($issueKey),
                rawurlencode($commentId)
            )
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function addIssueWorklog(
        string $issueKey,
        string $timeSpent,
        ?string $comment = null,
    ): array {
        $payload = [
            'timeSpent' => $timeSpent,
        ];

        if (null !== $comment && '' !== $comment) {
            $payload['comment'] = $this->plainTextDocument($comment);
        }

        return $this->client->request(
            'POST',
            sprintf(
                '/rest/api/3/issue/%s/worklog',
                rawurlencode($issueKey)
            ),
            [
                'query' => [
                    'adjustEstimate' => 'auto',
                ],
                'json' => $payload,
            ]
        );
    }

    /**
     * @return array{content: string, contentType: string}
     */
    public function getAttachmentImage(
        string $attachmentId,
        bool $thumbnail,
    ): array {
        return $this->media->getAttachmentImage($attachmentId, $thumbnail);
    }

    public function transitionIssue(
        string $issueKey,
        string $transitionId,
    ): void {
        $this->client->request(
            'POST',
            sprintf('/rest/api/3/issue/%s/transitions', rawurlencode($issueKey)),
            [
                'json' => [
                    'transition' => [
                        'id' => $transitionId,
                    ],
                ],
            ]
        );
    }

    /**
     * @return array{content: string, contentType: string}
     */
    public function getMedia(string $url): array
    {
        return $this->media->getMedia($url);
    }

    /**
     * @param list<array{accountId: string, text: string}> $mentions
     *
     * @return array<string, mixed>
     */
    public function plainTextDocument(string $text, array $mentions = []): array
    {
        $paragraphs = preg_split('/\R/u', trim($text)) ?: [];

        return [
            'type' => 'doc',
            'version' => 1,
            'content' => array_map(
                fn (string $paragraph): array => [
                    'type' => 'paragraph',
                    'content' => $this->plainTextInlineContent(
                        $paragraph,
                        $mentions
                    ),
                ],
                $paragraphs
            ),
        ];
    }

    /**
     * @param list<array{accountId: string, text: string}> $mentions
     *
     * @return list<array<string, mixed>>
     */
    private function plainTextInlineContent(
        string $text,
        array $mentions,
    ): array {
        if ('' === $text) {
            return [];
        }

        $content = [];
        $cursor = 0;
        $length = strlen($text);

        while ($cursor < $length) {
            $next = null;

            foreach ($mentions as $mention) {
                $mentionText = $mention['text'];

                if ('' === $mentionText) {
                    continue;
                }

                $position = strpos($text, $mentionText, $cursor);

                if (
                    false !== $position
                    && (null === $next || $position < $next['position'])
                ) {
                    $next = [
                        'position' => $position,
                        'accountId' => (string) $mention['accountId'],
                        'text' => $mentionText,
                    ];
                }
            }

            if (null === $next) {
                $content[] = [
                    'type' => 'text',
                    'text' => substr($text, $cursor),
                ];
                break;
            }

            if ($next['position'] > $cursor) {
                $content[] = [
                    'type' => 'text',
                    'text' => substr(
                        $text,
                        $cursor,
                        $next['position'] - $cursor
                    ),
                ];
            }

            $content[] = [
                'type' => 'mention',
                'attrs' => [
                    'id' => $next['accountId'],
                    'text' => $next['text'],
                ],
            ];
            $cursor = $next['position'] + strlen($next['text']);
        }

        return $content;
    }

    /**
     * @param array<string, mixed> $board
     *
     * @return array{id: ?string, key: ?string, name: string}
     */
    private function boardProject(array $board): array
    {
        $location = is_array($board['location'] ?? null)
            ? $board['location']
            : [];
        $projectId = trim((string) ($location['projectId'] ?? ''));
        $projectKey = trim((string) ($location['projectKey'] ?? ''));

        if ('' === $projectId && '' === $projectKey) {
            throw new InvalidArgumentException('The Jira board is not associated with a project.');
        }

        return [
            'id' => '' === $projectId ? null : $projectId,
            'key' => '' === $projectKey ? null : $projectKey,
            'name' => trim((string) (
                $location['projectName']
                ?? $location['displayName']
                ?? $projectKey
            )),
        ];
    }
}
