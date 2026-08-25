<?php

namespace App\Controller;

use App\Service\JiraApiService;
use DateTimeImmutable;
use Symfony\Contracts\Cache\CacheInterface;
use Symfony\Contracts\Cache\ItemInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/jira')]
final class JiraController
{
    public function __construct(
        private readonly JiraApiService $jira,
        private readonly CacheInterface $cache,
    ) {
    }

    #[Route('/board/{boardId}', methods: ['GET'])]
    public function board(int $boardId): JsonResponse
    {
        return new JsonResponse([
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
                sprintf('jira.board.%d.issues', $boardId),
                function (ItemInterface $item) use ($boardId): array {
                    $item->expiresAfter(60);

                    $issues = $this->jira->getBoardIssues($boardId);
                    $issues['snapshotAt'] =
                        (new DateTimeImmutable())->format(DATE_ATOM);

                    return $issues;
                }
            ),
        ]);
    }

    #[Route('/board/{boardId}/changes', methods: ['GET'])]
    public function changes(int $boardId, Request $request): JsonResponse
    {
        $sinceValue = $request->query->getString('since');

        if ($sinceValue === '') {
            return new JsonResponse([
                'error' => 'Le paramètre since est requis.',
            ], 400);
        }

        try {
            $since = new DateTimeImmutable($sinceValue);
        } catch (\Exception) {
            return new JsonResponse([
                'error' => 'Le paramètre since est invalide.',
            ], 400);
        }

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
                $active[] = $issue;
            } else {
                $removed[] = (string) $issue['key'];
            }
        }

        return new JsonResponse([
            'cursor' => (new DateTimeImmutable())->format(DATE_ATOM),
            'issues' => $active,
            'removed' => array_values(array_unique($removed)),
        ], headers: [
            'Cache-Control' => 'no-store',
        ]);
    }

    private function isInActiveSprint(array $issue): bool
    {
        $fields = is_array($issue['fields'] ?? null)
            ? $issue['fields']
            : [];

        foreach ($fields as $field => $value) {
            if (!str_contains(strtolower((string) $field), 'sprint')) {
                continue;
            }

            if (!is_array($value)) {
                continue;
            }

            $sprints = isset($value['state']) ? [$value] : $value;

            foreach ($sprints as $sprint) {
                if (
                    is_array($sprint) &&
                    strtolower((string) ($sprint['state'] ?? '')) === 'active'
                ) {
                    return true;
                }
            }
        }

        return false;
    }

    #[Route('/issue/{issueKey}', methods: ['GET'])]
    public function issue(string $issueKey): JsonResponse
    {
        return new JsonResponse(
            $this->jira->getIssue($issueKey)
        );
    }

    #[Route('/media', methods: ['GET'])]
    public function media(Request $request): Response
    {
        $url = $request->query->getString('url');

        if ($url === '') {
            return new Response(status: Response::HTTP_BAD_REQUEST);
        }

        try {
            $media = $this->jira->getMedia($url);
        } catch (\InvalidArgumentException) {
            return new Response(status: Response::HTTP_BAD_REQUEST);
        } catch (\Throwable) {
            return new Response(status: Response::HTTP_BAD_GATEWAY);
        }

        return new Response($media['content'], headers: [
            'Content-Type' => $media['contentType'],
            'Content-Disposition' => 'inline',
            'Cache-Control' => 'private, max-age=3600',
            'Content-Security-Policy' => "default-src 'none'; sandbox",
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    #[Route(
        '/attachment/{attachmentId}/{variant}',
        requirements: [
            'attachmentId' => '\\d+',
            'variant' => 'thumbnail|content',
        ],
        methods: ['GET']
    )]
    public function attachmentMedia(
        string $attachmentId,
        string $variant,
    ): Response {
        try {
            $media = $this->jira->getAttachmentImage(
                $attachmentId,
                $variant === 'thumbnail'
            );
        } catch (\InvalidArgumentException) {
            return new Response(status: Response::HTTP_BAD_REQUEST);
        } catch (\Throwable) {
            return new Response(status: Response::HTTP_BAD_GATEWAY);
        }

        return new Response($media['content'], headers: [
            'Content-Type' => $media['contentType'],
            'Content-Disposition' => 'inline',
            'Cache-Control' => 'private, max-age=3600',
            'Content-Security-Policy' => "default-src 'none'; sandbox",
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    #[Route('/issue/{issueKey}/transitions', methods: ['GET'])]
    public function transitions(string $issueKey): JsonResponse
    {
        return new JsonResponse(
            $this->jira->getTransitions($issueKey)
        );
    }

    #[Route('/issue/{issueKey}/comments', methods: ['GET'])]
    public function comments(string $issueKey): JsonResponse
    {
        $response = $this->jira->getIssueComments($issueKey);

        try {
            $currentUser = $this->cache->get(
                'jira.current_user',
                function (ItemInterface $item): array {
                    $item->expiresAfter(3600);

                    return $this->jira->getCurrentUser();
                }
            );
            $response['currentUser'] = [
                'accountId' => $currentUser['accountId'] ?? null,
                'displayName' => $currentUser['displayName'] ?? null,
            ];
        } catch (\Throwable) {
            $response['currentUser'] = null;
        }

        return new JsonResponse($response);
    }

    #[Route('/users', methods: ['GET'])]
    public function users(Request $request): JsonResponse
    {
        $query = trim($request->query->getString('query'));

        if ($query === '' || mb_strlen($query) > 80) {
            return new JsonResponse(['users' => []]);
        }

        return new JsonResponse([
            'users' => $this->jira->searchUsers($query),
        ]);
    }

    #[Route('/issue/{issueKey}', methods: ['PATCH'])]
    public function updateIssue(
        string $issueKey,
        Request $request,
    ): JsonResponse {
        $data = $request->toArray();
        $fields = [];

        if (array_key_exists('summary', $data)) {
            $summary = trim((string) $data['summary']);

            if ($summary === '' || mb_strlen($summary) > 255) {
                return new JsonResponse([
                    'error' => 'Le titre doit contenir entre 1 et 255 caractères.',
                ], 400);
            }

            $fields['summary'] = $summary;
        }

        if (array_key_exists('description', $data)) {
            $description = trim((string) $data['description']);
            $fields['description'] = $description === ''
                ? null
                : $this->jira->plainTextDocument($description);
        }

        if (array_key_exists('labels', $data)) {
            if (!is_array($data['labels'])) {
                return new JsonResponse([
                    'error' => 'Les étiquettes doivent être une liste.',
                ], 400);
            }

            $fields['labels'] = array_values(array_unique(array_filter(
                array_map(
                    static fn (mixed $label): string => trim((string) $label),
                    $data['labels']
                ),
                static fn (string $label): bool => $label !== ''
            )));
        }

        if (array_key_exists('dueDate', $data)) {
            $dueDate = trim((string) $data['dueDate']);

            if (
                $dueDate !== ''
                && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dueDate)
            ) {
                return new JsonResponse([
                    'error' => 'La date d’échéance est invalide.',
                ], 400);
            }

            $fields['duedate'] = $dueDate === '' ? null : $dueDate;
        }

        $timeTracking = [];

        foreach ([
            'originalEstimate' => 'originalEstimate',
            'remainingEstimate' => 'remainingEstimate',
        ] as $input => $jiraField) {
            if (!array_key_exists($input, $data)) {
                continue;
            }

            $value = trim((string) $data[$input]);

            if ($value !== '' && !$this->isJiraDuration($value)) {
                return new JsonResponse([
                    'error' => sprintf('La durée « %s » est invalide.', $value),
                ], 400);
            }

            if ($value !== '') {
                $timeTracking[$jiraField] = $value;
            }
        }

        if ($timeTracking !== []) {
            $fields['timetracking'] = $timeTracking;
        }

        if ($fields === []) {
            return new JsonResponse([
                'error' => 'Aucun champ modifiable fourni.',
            ], 400);
        }

        $this->jira->updateIssue($issueKey, $fields);

        return new JsonResponse(['success' => true]);
    }

    #[Route('/issue/{issueKey}/comments', methods: ['POST'])]
    public function addComment(
        string $issueKey,
        Request $request,
    ): JsonResponse {
        $data = $request->toArray();
        $comment = trim((string) ($data['comment'] ?? ''));

        if ($comment === '') {
            return new JsonResponse([
                'error' => 'Le commentaire ne peut pas être vide.',
            ], 400);
        }

        return new JsonResponse(
            $this->jira->addIssueComment(
                $issueKey,
                $comment,
                $this->mentionsFromRequest($data)
            ),
            201
        );
    }

    #[Route(
        '/issue/{issueKey}/comments/{commentId}',
        requirements: ['commentId' => '\\d+'],
        methods: ['PUT']
    )]
    public function updateComment(
        string $issueKey,
        string $commentId,
        Request $request,
    ): JsonResponse {
        $data = $request->toArray();
        $comment = trim((string) ($data['comment'] ?? ''));

        if ($comment === '') {
            return new JsonResponse([
                'error' => 'Le commentaire ne peut pas être vide.',
            ], 400);
        }

        return new JsonResponse(
            $this->jira->updateIssueComment(
                $issueKey,
                $commentId,
                $comment,
                $this->mentionsFromRequest($data)
            )
        );
    }

    #[Route(
        '/issue/{issueKey}/comments/{commentId}',
        requirements: ['commentId' => '\\d+'],
        methods: ['DELETE']
    )]
    public function deleteComment(
        string $issueKey,
        string $commentId,
    ): JsonResponse {
        $this->jira->deleteIssueComment($issueKey, $commentId);

        return new JsonResponse(status: 204);
    }

    #[Route('/issue/{issueKey}/worklogs', methods: ['POST'])]
    public function addWorklog(
        string $issueKey,
        Request $request,
    ): JsonResponse {
        $data = $request->toArray();
        $timeSpent = trim((string) ($data['timeSpent'] ?? ''));
        $comment = trim((string) ($data['comment'] ?? ''));

        if (!$this->isJiraDuration($timeSpent)) {
            return new JsonResponse([
                'error' => 'Le temps doit utiliser un format Jira, par exemple 1h 30m.',
            ], 400);
        }

        return new JsonResponse(
            $this->jira->addIssueWorklog(
                $issueKey,
                $timeSpent,
                $comment === '' ? null : $comment
            ),
            201
        );
    }

    #[Route('/issue/{issueKey}/transition', methods: ['POST'])]
    public function transition(
        string $issueKey,
        Request $request,
    ): JsonResponse {
        $data = $request->toArray();
        $transitionId = $data['transitionId'] ?? null;

        if (!is_string($transitionId) || $transitionId === '') {
            return new JsonResponse([
                'error' => 'transitionId is required',
            ], 400);
        }

        $this->jira->transitionIssue(
            $issueKey,
            $transitionId
        );

        return new JsonResponse([
            'success' => true,
        ]);
    }

    private function isJiraDuration(string $value): bool
    {
        return $value !== '' && (bool) preg_match(
            '/^(?:\d+\s*[wdhm]\s*)+$/i',
            $value
        );
    }

    /**
     * @param array<string, mixed> $data
     * @return list<array{accountId: string, text: string}>
     */
    private function mentionsFromRequest(array $data): array
    {
        if (!is_array($data['mentions'] ?? null)) {
            return [];
        }

        $mentions = [];

        foreach (array_slice($data['mentions'], 0, 20) as $mention) {
            if (!is_array($mention)) {
                continue;
            }

            $accountId = trim((string) ($mention['accountId'] ?? ''));
            $text = trim((string) ($mention['text'] ?? ''));

            if (
                $accountId === ''
                || $text === ''
                || !str_starts_with($text, '@')
                || mb_strlen($accountId) > 255
                || mb_strlen($text) > 160
            ) {
                continue;
            }

            $mentions[$accountId] = [
                'accountId' => $accountId,
                'text' => $text,
            ];
        }

        return array_values($mentions);
    }
}
