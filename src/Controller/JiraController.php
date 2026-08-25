<?php

namespace App\Controller;

use App\Board\BoardSnapshotProvider;
use App\Service\JiraApiService;
use DateTimeImmutable;
use Symfony\Contracts\Cache\CacheInterface;
use Symfony\Contracts\Cache\ItemInterface;
use Symfony\Contracts\Translation\TranslatorInterface;
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
        private readonly BoardSnapshotProvider $snapshots,
        private readonly TranslatorInterface $translator,
    ) {
    }

    #[Route('/board/{boardId}', methods: ['GET'])]
    public function board(int $boardId): JsonResponse
    {
        return new JsonResponse($this->snapshots->getSnapshot($boardId));
    }

    #[Route('/board/{boardId}/changes', methods: ['GET'])]
    public function changes(int $boardId, Request $request): JsonResponse
    {
        $sinceValue = $request->query->getString('since');

        if ($sinceValue === '') {
            return new JsonResponse([
                'error' => $this->translator->trans('api.since_required'),
            ], 400);
        }

        try {
            $since = new DateTimeImmutable($sinceValue);
        } catch (\Exception) {
            return new JsonResponse([
                'error' => $this->translator->trans('api.since_invalid'),
            ], 400);
        }

        return new JsonResponse($this->snapshots->getChanges(
            $boardId,
            $since
        ), headers: [
            'Cache-Control' => 'no-store',
        ]);
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
                    'error' => $this->translator->trans('api.summary_length'),
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
                    'error' => $this->translator->trans('api.labels_list'),
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
                    'error' => $this->translator->trans(
                        'api.due_date_invalid'
                    ),
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
                    'error' => $this->translator->trans(
                        'api.duration_invalid',
                        ['%value%' => $value]
                    ),
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
                'error' => $this->translator->trans('api.no_editable_field'),
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
                'error' => $this->translator->trans('api.empty_comment'),
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
                'error' => $this->translator->trans('api.empty_comment'),
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
                'error' => $this->translator->trans('api.worklog_format'),
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
                'error' => $this->translator->trans(
                    'api.transition_required'
                ),
            ], 400);
        }

        $this->jira->transitionIssue(
            $issueKey,
            $transitionId
        );
        $boardId = $data['boardId'] ?? null;

        if (is_int($boardId) || ctype_digit((string) $boardId)) {
            $this->snapshots->invalidateIssues((int) $boardId);
        }

        return new JsonResponse($this->jira->getIssue($issueKey), headers: [
            'Cache-Control' => 'no-store',
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
