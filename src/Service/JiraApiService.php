<?php

namespace App\Service;

use DateTimeImmutable;
use DateTimeZone;
use Symfony\Contracts\HttpClient\HttpClientInterface;
use Symfony\Contracts\HttpClient\ResponseInterface;

final class JiraApiService
{
    private const PAGE_SIZE = 100;
    private const MAX_MEDIA_SIZE = 5_000_000;
    private const IMAGE_CONTENT_TYPES = [
        'image/avif',
        'image/gif',
        'image/jpeg',
        'image/png',
        'image/svg+xml',
        'image/webp',
        'image/x-icon',
        'image/vnd.microsoft.icon',
    ];
    private const MEDIA_HOST_SUFFIXES = [
        '.atlassian.com',
        '.atl-paas.net',
    ];
    private const MEDIA_HOSTS = [
        'secure.gravatar.com',
        'www.gravatar.com',
    ];

    public function __construct(
        private readonly HttpClientInterface $client,
        private readonly string $baseUrl,
        private readonly string $email,
        private readonly string $apiToken,
    ) {
    }

    public function getBoard(int $boardId): array
    {
        return $this->request(
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
            $page = $this->request('GET', '/rest/agile/1.0/board', [
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
        return $this->request(
            'GET',
            sprintf('/rest/agile/1.0/board/%d/configuration', $boardId)
        );
    }

    public function getBoardIssues(int $boardId): array
    {
        return $this->getAllIssuePages(
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

        return $this->getAllIssuePages(
            sprintf('/rest/agile/1.0/board/%d/issue', $boardId),
            sprintf(
                'updated >= "%s" ORDER BY updated ASC',
                $jiraSince
            )
        );
    }

    public function getBoardEpics(int $boardId): array
    {
        return $this->request(
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
        return $this->request(
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
        return $this->request(
            'GET',
            sprintf('/rest/api/3/issue/%s/transitions', rawurlencode($issueKey))
        );
    }

    public function getIssueComments(string $issueKey): array
    {
        $startAt = 0;
        $comments = [];

        do {
            $page = $this->request(
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
        return $this->request('GET', '/rest/api/3/myself');
    }

    /**
     * @return list<array{accountId: string, displayName: string, avatarUrl: ?string}>
     */
    public function searchUsers(string $query): array
    {
        $response = $this->request('GET', '/rest/api/3/user/picker', [
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
        $this->request(
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
        return $this->request(
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
        return $this->request(
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
        $this->request(
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

        return $this->request(
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
        if ($attachmentId === '' || !ctype_digit($attachmentId)) {
            throw new \InvalidArgumentException(
                'Identifiant de pièce jointe invalide.'
            );
        }

        $path = $thumbnail
            ? sprintf(
                '/rest/api/3/attachment/thumbnail/%s',
                rawurlencode($attachmentId)
            )
            : sprintf(
                '/rest/api/3/attachment/content/%s',
                rawurlencode($attachmentId)
            );
        $query = $thumbnail
            ? '?redirect=false&fallbackToDefault=true&width=1200&height=1200'
            : '?redirect=false';

        return $this->getMedia(
            rtrim($this->baseUrl, '/').$path.$query
        );
    }

    public function transitionIssue(
        string $issueKey,
        string $transitionId,
    ): void {
        $this->request(
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
        if (str_starts_with($url, '/')) {
            $url = rtrim($this->baseUrl, '/').$url;
        }

        for ($redirects = 0; $redirects <= 3; ++$redirects) {
            $isJiraHost = $this->validateMediaUrl($url);
            $options = [
                'headers' => [
                    'Accept' => '*/*',
                ],
                'max_redirects' => 0,
            ];

            if ($isJiraHost) {
                $options['auth_basic'] = [
                    $this->email,
                    $this->apiToken,
                ];
            }

            $response = $this->client->request('GET', $url, $options);
            $status = $response->getStatusCode();
            $headers = $response->getHeaders(false);

            if ($status >= 300 && $status < 400) {
                $location = $headers['location'][0] ?? null;

                if (!is_string($location) || $location === '') {
                    throw new \RuntimeException('Redirection média invalide.');
                }

                $url = $this->resolveMediaRedirect($url, $location);
                continue;
            }

            if ($status < 200 || $status >= 300) {
                throw new \RuntimeException('Média Jira indisponible.');
            }

            $contentType = strtolower(
                trim(
                    explode(
                        ';',
                        (string)($headers['content-type'][0] ?? '')
                    )[0]
                )
            );

            $declaredSize = (int)($headers['content-length'][0] ?? 0);

            if ($declaredSize > self::MAX_MEDIA_SIZE) {
                throw new \RuntimeException('Média Jira trop volumineux.');
            }

            $content = $response->getContent(false);

            if (strlen($content) > self::MAX_MEDIA_SIZE) {
                throw new \RuntimeException('Média Jira trop volumineux.');
            }

            if (!in_array($contentType, self::IMAGE_CONTENT_TYPES, true)) {
                $detectedType = class_exists(\finfo::class)
                    ? (new \finfo(FILEINFO_MIME_TYPE))->buffer($content)
                    : false;

                if (
                    !is_string($detectedType) ||
                    !in_array($detectedType, self::IMAGE_CONTENT_TYPES, true)
                ) {
                    throw new \RuntimeException(
                        'Type de média Jira non autorisé.'
                    );
                }

                $contentType = $detectedType;
            }

            return [
                'content' => $content,
                'contentType' => $contentType,
            ];
        }

        throw new \RuntimeException('Trop de redirections média.');
    }

    private function request(
        string $method,
        string $uri,
        array $options = [],
    ): array {
        $response = $this->client->request(
            $method,
            rtrim($this->baseUrl, '/').$uri,
            array_merge_recursive(
                [
                    'auth_basic' => [
                        $this->email,
                        $this->apiToken,
                    ],
                    'headers' => [
                        'Accept' => 'application/json',
                        'Content-Type' => 'application/json',
                    ],
                ],
                $options
            )
        );

        return $this->decode($response);
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

    private function validateMediaUrl(string $url): bool
    {
        $parts = parse_url($url);
        $baseParts = parse_url($this->baseUrl);
        $scheme = strtolower((string)($parts['scheme'] ?? ''));
        $host = strtolower((string)($parts['host'] ?? ''));
        $baseScheme = strtolower((string)($baseParts['scheme'] ?? ''));
        $baseHost = strtolower((string)($baseParts['host'] ?? ''));
        $port = $parts['port'] ?? null;
        $basePort = $baseParts['port'] ?? null;
        $isJiraHost = $host !== ''
            && hash_equals($baseHost, $host)
            && $scheme === $baseScheme
            && $port === $basePort;

        if ($isJiraHost) {
            return true;
        }

        if ($scheme !== 'https' || $port !== null) {
            throw new \InvalidArgumentException('URL de média non autorisée.');
        }

        if (in_array($host, self::MEDIA_HOSTS, true)) {
            return false;
        }

        foreach (self::MEDIA_HOST_SUFFIXES as $suffix) {
            if (str_ends_with($host, $suffix)) {
                return false;
            }
        }

        throw new \InvalidArgumentException('Domaine de média non autorisé.');
    }

    private function resolveMediaRedirect(string $source, string $location): string
    {
        if (parse_url($location, PHP_URL_SCHEME) !== null) {
            return $location;
        }

        $parts = parse_url($source);
        $origin = sprintf(
            '%s://%s%s',
            $parts['scheme'],
            $parts['host'],
            isset($parts['port']) ? ':'.$parts['port'] : ''
        );

        if (str_starts_with($location, '//')) {
            return $parts['scheme'].':'.$location;
        }

        if (str_starts_with($location, '/')) {
            return $origin.$location;
        }

        $path = (string)($parts['path'] ?? '/');

        return $origin.rtrim(dirname($path), '/').'/'.$location;
    }

    private function getAllIssuePages(string $uri, string $jql): array
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

            $pageIssues = $lastPage['issues'] ?? [];

            if (!is_array($pageIssues)) {
                $pageIssues = [];
            }

            array_push($issues, ...$pageIssues);
            $startAt += count($pageIssues);

            if (isset($lastPage['total'])) {
                $hasMore = $startAt < (int)$lastPage['total'];
            } else {
                $pageSize = (int)(
                    $lastPage['maxResults'] ?? self::PAGE_SIZE
                );
                $hasMore = count($pageIssues) >= $pageSize;
            }
        } while ($pageIssues !== [] && $hasMore);

        $lastPage['issues'] = $issues;
        $lastPage['startAt'] = 0;
        $lastPage['maxResults'] = count($issues);
        $lastPage['total'] = count($issues);

        return $lastPage;
    }

    private function decode(ResponseInterface $response): array
    {
        if ($response->getStatusCode() === 204) {
            return [];
        }

        return $response->toArray();
    }
}
