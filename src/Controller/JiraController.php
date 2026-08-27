<?php

declare(strict_types=1);

namespace App\Controller;

use App\Board\BoardSnapshotProvider;
use App\Dto\Request\AddCommentRequest;
use App\Dto\Request\AddWorklogRequest;
use App\Dto\Request\TransitionRequest;
use App\Dto\Request\UpdateIssueRequest;
use App\Jira\Document\AdfDocumentFactory;
use App\Jira\JiraMediaProxy;
use App\Jira\Repository\BoardRepository;
use App\Jira\Repository\IssueRepository;
use App\Jira\Repository\UserRepository;

use function array_key_exists;
use function array_slice;

use DateTimeImmutable;
use Exception;
use InvalidArgumentException;

use function is_array;
use function is_int;
use function is_string;

use Psr\Log\LoggerInterface;

use function sprintf;

use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsCsrfTokenValid;
use Symfony\Component\Validator\Validator\ValidatorInterface;
use Symfony\Contracts\Cache\CacheInterface;
use Symfony\Contracts\Cache\ItemInterface;
use Symfony\Contracts\Translation\TranslatorInterface;
use Throwable;

#[Route('/api/jira')]
final class JiraController
{
    public function __construct(
        private readonly BoardRepository $jira,
        private readonly CacheInterface $cache,
        private readonly BoardSnapshotProvider $snapshots,
        private readonly UserRepository $users,
        private readonly IssueRepository $issues,
        private readonly AdfDocumentFactory $documents,
        private readonly JiraMediaProxy $mediaProxy,
        private readonly TranslatorInterface $translator,
        private readonly LoggerInterface $logger,
        private readonly ValidatorInterface $validator,
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

        if ('' === $sinceValue) {
            return new JsonResponse([
                'error' => $this->translator->trans('api.since_required'),
            ], 400);
        }

        try {
            $since = new DateTimeImmutable($sinceValue);
        } catch (Exception) {
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

    #[Route('/board/{boardId}/create-metadata', methods: ['GET'])]
    public function createMetadata(int $boardId): JsonResponse
    {
        try {
            $metadata = $this->cache->get(
                sprintf('jira.board.%d.create_metadata', $boardId),
                function (ItemInterface $item) use ($boardId): array {
                    $item->expiresAfter(300);

                    return $this->jira->getBoardCreateMetadata($boardId);
                }
            );
        } catch (InvalidArgumentException) {
            return new JsonResponse([
                'error' => $this->translator->trans(
                    'api.board_project_required'
                ),
            ], 400);
        }

        return new JsonResponse($metadata);
    }

    #[Route('/board/{boardId}/issues', methods: ['POST'])]
    #[IsCsrfTokenValid(
        'jira_api',
        tokenKey: 'X-CSRF-Token',
        tokenSource: IsCsrfTokenValid::SOURCE_HEADER
    )]
    public function createIssue(int $boardId, Request $request): JsonResponse
    {
        if ($response = $this->unsupportedContentType($request)) {
            return $response;
        }

        $data = $request->toArray();
        $summary = trim((string) ($data['summary'] ?? ''));
        $description = trim((string) ($data['description'] ?? ''));
        $issueTypeId = trim((string) ($data['issueTypeId'] ?? ''));
        $sprintId = trim((string) ($data['sprintId'] ?? ''));
        $epicKey = trim((string) ($data['epicKey'] ?? ''));

        if ('' === $summary || mb_strlen($summary) > 255) {
            return new JsonResponse([
                'error' => $this->translator->trans('api.summary_length'),
            ], 400);
        }

        if ('' === $issueTypeId || !ctype_digit($issueTypeId)) {
            return new JsonResponse([
                'error' => $this->translator->trans(
                    'api.issue_type_required'
                ),
            ], 400);
        }

        if ('' !== $sprintId && !ctype_digit($sprintId)) {
            return new JsonResponse([
                'error' => $this->translator->trans(
                    'api.sprint_invalid'
                ),
            ], 400);
        }

        if (
            '' !== $epicKey
            && !preg_match('/^[A-Z][A-Z0-9_]*-\d+$/i', $epicKey)
        ) {
            return new JsonResponse([
                'error' => $this->translator->trans('api.epic_invalid'),
            ], 400);
        }

        try {
            $issue = $this->jira->createBoardIssue(
                $boardId,
                $issueTypeId,
                $summary,
                '' === $description ? null : $description,
                '' === $sprintId ? null : $sprintId,
                '' === $epicKey ? null : $epicKey
            );
        } catch (InvalidArgumentException) {
            return new JsonResponse([
                'error' => $this->translator->trans(
                    'api.board_project_required'
                ),
            ], 400);
        }
        $this->snapshots->invalidateIssues($boardId);

        return new JsonResponse($issue, 201, [
            'Cache-Control' => 'no-store',
        ]);
    }

    #[Route('/issue/{issueKey}', methods: ['GET'])]
    public function issue(string $issueKey): JsonResponse
    {
        return new JsonResponse(
            $this->issues->getIssue($issueKey)
        );
    }

    #[Route('/media', methods: ['GET'])]
    public function media(Request $request): Response
    {
        $url = $request->query->getString('url');

        if ('' === $url) {
            return new Response(status: Response::HTTP_BAD_REQUEST);
        }

        try {
            $media = $this->mediaProxy->getMedia($url);
        } catch (InvalidArgumentException) {
            return new Response(status: Response::HTTP_BAD_REQUEST);
        } catch (Throwable) {
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
            $media = $this->mediaProxy->getAttachmentImage(
                $attachmentId,
                'thumbnail' === $variant
            );
        } catch (InvalidArgumentException) {
            return new Response(status: Response::HTTP_BAD_REQUEST);
        } catch (Throwable) {
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
            $this->issues->getTransitions($issueKey)
        );
    }

    #[Route('/issue/{issueKey}/comments', methods: ['GET'])]
    public function comments(string $issueKey): JsonResponse
    {
        $response = $this->issues->getIssueComments($issueKey);

        try {
            $currentUser = $this->cache->get(
                'jira.current_user',
                function (ItemInterface $item): array {
                    $item->expiresAfter(3600);

                    return $this->users->getCurrentUser();
                }
            );
            $response['currentUser'] = [
                'accountId' => $currentUser['accountId'] ?? null,
                'displayName' => $currentUser['displayName'] ?? null,
            ];
        } catch (Throwable $exception) {
            $this->logger->error('Unable to resolve the current Jira user.', [
                'exception' => $exception,
            ]);
            $response['currentUser'] = null;
        }

        return new JsonResponse($response);
    }

    #[Route('/users', methods: ['GET'])]
    public function users(Request $request): JsonResponse
    {
        $query = trim($request->query->getString('query'));

        if ('' === $query || mb_strlen($query) > 80) {
            return new JsonResponse(['users' => []]);
        }

        return new JsonResponse([
            'users' => $this->users->searchUsers($query),
        ]);
    }

    #[Route('/issue/{issueKey}', methods: ['PATCH'])]
    #[IsCsrfTokenValid(
        'jira_api',
        tokenKey: 'X-CSRF-Token',
        tokenSource: IsCsrfTokenValid::SOURCE_HEADER
    )]
    public function updateIssue(
        string $issueKey,
        Request $request,
    ): JsonResponse {
        if ($response = $this->unsupportedContentType($request)) {
            return $response;
        }

        $data = $request->toArray();
        $payload = new UpdateIssueRequest(
            array_key_exists('summary', $data)
                ? trim((string) $data['summary'])
                : null,
            array_key_exists('description', $data)
                ? trim((string) $data['description'])
                : null,
            $data['labels'] ?? null,
            array_key_exists('dueDate', $data)
                && '' !== trim((string) $data['dueDate'])
                ? trim((string) $data['dueDate'])
                : null,
            array_key_exists('originalEstimate', $data)
                && '' !== trim((string) $data['originalEstimate'])
                ? trim((string) $data['originalEstimate'])
                : null,
            array_key_exists('remainingEstimate', $data)
                && '' !== trim((string) $data['remainingEstimate'])
                ? trim((string) $data['remainingEstimate'])
                : null,
        );

        if ($response = $this->validationResponse($payload)) {
            return $response;
        }
        $fields = [];

        if (array_key_exists('summary', $data)) {
            $fields['summary'] = $payload->summary;
        }

        if (array_key_exists('description', $data)) {
            $fields['description'] = '' === $payload->description
                ? null
                : $this->documents->plainTextDocument(
                    (string) $payload->description
                );
        }

        if (array_key_exists('labels', $data)) {
            $fields['labels'] = array_values(array_unique(array_filter(
                array_map(
                    static fn (mixed $label): string => trim((string) $label),
                    $payload->labels
                ),
                static fn (string $label): bool => '' !== $label
            )));
        }

        if (array_key_exists('dueDate', $data)) {
            $fields['duedate'] = $payload->dueDate;
        }

        $timeTracking = [];

        foreach ([
            'originalEstimate' => 'originalEstimate',
            'remainingEstimate' => 'remainingEstimate',
        ] as $input => $jiraField) {
            if (!array_key_exists($input, $data)) {
                continue;
            }

            $value = 'originalEstimate' === $input
                ? $payload->originalEstimate
                : $payload->remainingEstimate;

            if (null !== $value) {
                $timeTracking[$jiraField] = $value;
            }
        }

        if ([] !== $timeTracking) {
            $fields['timetracking'] = $timeTracking;
        }

        if ([] === $fields) {
            return new JsonResponse([
                'error' => $this->translator->trans('api.no_editable_field'),
            ], 400);
        }

        $this->issues->updateIssue($issueKey, $fields);

        return new JsonResponse(['success' => true]);
    }

    #[Route('/issue/{issueKey}/comments', methods: ['POST'])]
    #[IsCsrfTokenValid(
        'jira_api',
        tokenKey: 'X-CSRF-Token',
        tokenSource: IsCsrfTokenValid::SOURCE_HEADER
    )]
    public function addComment(
        string $issueKey,
        Request $request,
    ): JsonResponse {
        if ($response = $this->unsupportedContentType($request)) {
            return $response;
        }

        $data = $request->toArray();
        $payload = new AddCommentRequest(
            trim((string) ($data['comment'] ?? '')),
            $this->mentionsFromRequest($data)
        );

        if ($response = $this->validationResponse($payload)) {
            return $response;
        }

        return new JsonResponse(
            $this->issues->addIssueComment(
                $issueKey,
                $payload->comment,
                $payload->mentions
            ),
            201
        );
    }

    #[Route(
        '/issue/{issueKey}/comments/{commentId}',
        requirements: ['commentId' => '\\d+'],
        methods: ['PUT']
    )]
    #[IsCsrfTokenValid(
        'jira_api',
        tokenKey: 'X-CSRF-Token',
        tokenSource: IsCsrfTokenValid::SOURCE_HEADER
    )]
    public function updateComment(
        string $issueKey,
        string $commentId,
        Request $request,
    ): JsonResponse {
        if ($response = $this->unsupportedContentType($request)) {
            return $response;
        }

        $data = $request->toArray();
        $payload = new AddCommentRequest(
            trim((string) ($data['comment'] ?? '')),
            $this->mentionsFromRequest($data)
        );

        if ($response = $this->validationResponse($payload)) {
            return $response;
        }

        return new JsonResponse(
            $this->issues->updateIssueComment(
                $issueKey,
                $commentId,
                $payload->comment,
                $payload->mentions
            )
        );
    }

    #[Route(
        '/issue/{issueKey}/comments/{commentId}',
        requirements: ['commentId' => '\\d+'],
        methods: ['DELETE']
    )]
    #[IsCsrfTokenValid(
        'jira_api',
        tokenKey: 'X-CSRF-Token',
        tokenSource: IsCsrfTokenValid::SOURCE_HEADER
    )]
    public function deleteComment(
        string $issueKey,
        string $commentId,
        Request $request,
    ): JsonResponse {
        if ($response = $this->unsupportedContentType($request)) {
            return $response;
        }

        $this->issues->deleteIssueComment($issueKey, $commentId);

        return new JsonResponse(status: 204);
    }

    #[Route('/issue/{issueKey}/worklogs', methods: ['POST'])]
    #[IsCsrfTokenValid(
        'jira_api',
        tokenKey: 'X-CSRF-Token',
        tokenSource: IsCsrfTokenValid::SOURCE_HEADER
    )]
    public function addWorklog(
        string $issueKey,
        Request $request,
    ): JsonResponse {
        if ($response = $this->unsupportedContentType($request)) {
            return $response;
        }

        $data = $request->toArray();
        $payload = new AddWorklogRequest(
            trim((string) ($data['timeSpent'] ?? '')),
            '' === trim((string) ($data['comment'] ?? ''))
                ? null
                : trim((string) $data['comment'])
        );

        if ($response = $this->validationResponse($payload)) {
            return $response;
        }

        return new JsonResponse(
            $this->issues->addIssueWorklog(
                $issueKey,
                $payload->timeSpent,
                $payload->comment
            ),
            201
        );
    }

    #[Route('/issue/{issueKey}/transition', methods: ['POST'])]
    #[IsCsrfTokenValid(
        'jira_api',
        tokenKey: 'X-CSRF-Token',
        tokenSource: IsCsrfTokenValid::SOURCE_HEADER
    )]
    public function transition(
        string $issueKey,
        Request $request,
    ): JsonResponse {
        if ($response = $this->unsupportedContentType($request)) {
            return $response;
        }

        $data = $request->toArray();
        $payload = new TransitionRequest(
            is_string($data['transitionId'] ?? null)
                ? $data['transitionId']
                : '',
            is_int($data['boardId'] ?? null)
                ? $data['boardId']
                : null
        );

        if ($response = $this->validationResponse($payload)) {
            return $response;
        }

        $this->issues->transitionIssue(
            $issueKey,
            $payload->transitionId
        );
        if (null !== $payload->boardId) {
            $this->snapshots->invalidateIssues($payload->boardId);
        }

        return new JsonResponse($this->issues->getIssue($issueKey), headers: [
            'Cache-Control' => 'no-store',
        ]);
    }

    private function validationResponse(object $payload): ?JsonResponse
    {
        $errors = [];

        foreach ($this->validator->validate($payload) as $violation) {
            $errors[$violation->getPropertyPath()] = $violation->getMessage();
        }

        return [] === $errors
            ? null
            : new JsonResponse(['errors' => $errors], 422);
    }

    private function unsupportedContentType(Request $request): ?JsonResponse
    {
        if (
            '' === $request->getContent()
            || str_starts_with(
                (string) $request->headers->get('Content-Type'),
                'application/json'
            )
        ) {
            return null;
        }

        return new JsonResponse([
            'error' => $this->translator->trans('api.json_required'),
        ], Response::HTTP_UNSUPPORTED_MEDIA_TYPE);
    }

    /**
     * @param array<string, mixed> $data
     *
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
                '' === $accountId
                || '' === $text
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
