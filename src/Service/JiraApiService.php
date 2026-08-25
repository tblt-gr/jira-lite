<?php

namespace App\Service;

use App\Jira\JiraClient;
use App\Jira\JiraMediaProxy;
use DateTimeImmutable;
use DateTimeZone;

final class JiraApiService
{
    private const PAGE_SIZE = 100;

    public function __construct(
        private readonly JiraClient $client,
        private readonly JiraMediaProxy $media,
    ) {
    }

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
            $isLast = (bool)($page['isLast'] ?? false);
            $total = isset($page['total']) ? (int)$page['total'] : null;
            $hasMore = !$isLast
                && $values !== []
                && ($total === null || $startAt < $total);
        } while ($hasMore);

        return $boards;
    }

    public function getBoardConfiguration(int $boardId): array
    {
        return $this->client->request(
            'GET',
            sprintf('/rest/agile/1.0/board/%d/configuration', $boardId)
        );
    }

    public function getBoardIssues(int $boardId): array
    {
        return $this->client->getAllIssuePages(
            sprintf('/rest/agile/1.0/board/%d/issue', $boardId),
            'sprint in openSprints() ORDER BY Rank ASC'
        );
    }

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

    public function getTransitions(string $issueKey): array
    {
        return $this->client->request(
            'GET',
            sprintf('/rest/api/3/issue/%s/transitions', rawurlencode($issueKey))
        );
    }

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
            $total = (int)($page['total'] ?? $startAt);
        } while ($pageComments !== [] && $startAt < $total);

        return [
            'startAt' => 0,
            'maxResults' => count($comments),
            'total' => count($comments),
            'comments' => $comments,
        ];
    }

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

            if ($accountId === '' || $displayName === '') {
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

    public function addIssueWorklog(
        string $issueKey,
        string $timeSpent,
        ?string $comment = null,
    ): array {
        $payload = [
            'timeSpent' => $timeSpent,
        ];

        if ($comment !== null && $comment !== '') {
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
     * @return list<array<string, mixed>>
     */
    private function plainTextInlineContent(
        string $text,
        array $mentions,
    ): array {
        if ($text === '') {
            return [];
        }

        $content = [];
        $cursor = 0;
        $length = strlen($text);

        while ($cursor < $length) {
            $next = null;

            foreach ($mentions as $mention) {
                $mentionText = (string) ($mention['text'] ?? '');

                if ($mentionText === '') {
                    continue;
                }

                $position = strpos($text, $mentionText, $cursor);

                if (
                    $position !== false
                    && ($next === null || $position < $next['position'])
                ) {
                    $next = [
                        'position' => $position,
                        'accountId' => (string) $mention['accountId'],
                        'text' => $mentionText,
                    ];
                }
            }

            if ($next === null) {
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
}
