<?php

declare(strict_types=1);

namespace App\Service;

use App\Board\BoardSnapshotProvider;
use App\Dto\Request\AddCommentRequest;
use App\Dto\Request\AddWorklogRequest;
use App\Dto\Request\CreateIssueRequest;
use App\Dto\Request\TransitionRequest;
use App\Dto\Request\UpdateIssueRequest;
use App\Jira\Document\AdfDocumentFactory;
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
use Symfony\Component\Validator\Validator\ValidatorInterface;
use Symfony\Contracts\Cache\CacheInterface;
use Symfony\Contracts\Cache\ItemInterface;
use Symfony\Contracts\Translation\TranslatorInterface;
use Throwable;

final class JiraApiRequestHandler
{
    public function __construct(
        private readonly BoardRepository $boards,
        private readonly IssueRepository $issues,
        private readonly UserRepository $users,
        private readonly BoardSnapshotProvider $snapshots,
        private readonly CacheInterface $cache,
        private readonly AdfDocumentFactory $documents,
        private readonly TranslatorInterface $translator,
        private readonly LoggerInterface $logger,
        private readonly ValidatorInterface $validator,
    ) {
    }

    public function changes(int $boardId, Request $request): JsonResponse
    {
        $sinceValue = $request->query->getString('since');

        if ('' === $sinceValue) {
            return new JsonResponse(['error' => $this->translator->trans('api.since_required')], 400);
        }

        try {
            $since = new DateTimeImmutable($sinceValue);
        } catch (Exception) {
            return new JsonResponse(['error' => $this->translator->trans('api.since_invalid')], 400);
        }

        return new JsonResponse($this->snapshots->getChanges($boardId, $since), headers: ['Cache-Control' => 'no-store']);
    }

    public function createMetadata(int $boardId): JsonResponse
    {
        try {
            $metadata = $this->cache->get(
                sprintf('jira.board.%d.create_metadata', $boardId),
                function (ItemInterface $item) use ($boardId): array {
                    $item->expiresAfter(300);

                    return $this->boards->getBoardCreateMetadata($boardId);
                }
            );
        } catch (InvalidArgumentException) {
            return new JsonResponse(['error' => $this->translator->trans('api.board_project_required')], 400);
        }

        return new JsonResponse($metadata);
    }

    public function boardMetadata(int $boardId): JsonResponse
    {
        $metadata = $this->cache->get(
            sprintf('jira.board.%d.metadata', $boardId),
            function (ItemInterface $item) use ($boardId): array {
                $item->expiresAfter(300);

                return $this->boards->getBoard($boardId);
            }
        );

        return new JsonResponse($metadata);
    }

    public function createIssue(int $boardId, Request $request): JsonResponse
    {
        if ($response = $this->unsupportedContentType($request)) {
            return $response;
        }

        $data = $request->toArray();
        $payload = new CreateIssueRequest(
            trim((string) ($data['issueTypeId'] ?? '')),
            trim((string) ($data['summary'] ?? '')),
            $this->nullableString($data, 'description'),
            $this->nullableString($data, 'sprintId'),
            $this->nullableString($data, 'epicKey'),
        );

        if ($response = $this->validationResponse($payload)) {
            return $response;
        }

        try {
            $issue = $this->boards->createBoardIssue($boardId, $payload->issueTypeId, $payload->summary, $payload->description, $payload->sprintId, $payload->epicKey);
        } catch (InvalidArgumentException) {
            return new JsonResponse(['error' => $this->translator->trans('api.board_project_required')], 400);
        }

        $this->snapshots->invalidateIssues($boardId);

        return new JsonResponse($issue, 201, ['Cache-Control' => 'no-store']);
    }

    public function comments(string $issueKey): JsonResponse
    {
        $response = $this->issues->getIssueComments($issueKey);

        try {
            $currentUser = $this->cache->get('jira.current_user', function (ItemInterface $item): array {
                $item->expiresAfter(3600);

                return $this->users->getCurrentUser();
            });
            $response['currentUser'] = ['accountId' => $currentUser['accountId'] ?? null, 'displayName' => $currentUser['displayName'] ?? null];
        } catch (Throwable $exception) {
            $this->logger->error('Unable to resolve the current Jira user.', ['exception' => $exception]);
            $response['currentUser'] = null;
        }

        return new JsonResponse($response);
    }

    public function updateIssue(string $issueKey, Request $request): JsonResponse
    {
        if ($response = $this->unsupportedContentType($request)) {
            return $response;
        }

        $data = $request->toArray();
        $payload = new UpdateIssueRequest(
            array_key_exists('summary', $data) ? trim((string) $data['summary']) : null,
            array_key_exists('description', $data) ? trim((string) $data['description']) : null,
            $data['labels'] ?? null,
            $this->nullableString($data, 'dueDate'),
            $this->nullableString($data, 'originalEstimate'),
            $this->nullableString($data, 'remainingEstimate'),
        );

        if ($response = $this->validationResponse($payload)) {
            return $response;
        }

        $fields = $this->editableFields($data, $payload);
        if ([] === $fields) {
            return new JsonResponse(['error' => $this->translator->trans('api.no_editable_field')], 400);
        }

        $this->issues->updateIssue($issueKey, $fields);

        return new JsonResponse(['success' => true]);
    }

    public function addComment(string $issueKey, Request $request): JsonResponse
    {
        if ($response = $this->unsupportedContentType($request)) {
            return $response;
        }

        $payload = $this->commentRequest($request->toArray());
        if ($response = $this->validationResponse($payload)) {
            return $response;
        }

        return new JsonResponse($this->issues->addIssueComment($issueKey, $payload->comment, $payload->mentions), 201);
    }

    public function updateComment(string $issueKey, string $commentId, Request $request): JsonResponse
    {
        if ($response = $this->unsupportedContentType($request)) {
            return $response;
        }

        $payload = $this->commentRequest($request->toArray());
        if ($response = $this->validationResponse($payload)) {
            return $response;
        }

        return new JsonResponse($this->issues->updateIssueComment($issueKey, $commentId, $payload->comment, $payload->mentions));
    }

    public function deleteComment(string $issueKey, string $commentId, Request $request): JsonResponse
    {
        if ($response = $this->unsupportedContentType($request)) {
            return $response;
        }

        $this->issues->deleteIssueComment($issueKey, $commentId);

        return new JsonResponse(status: 204);
    }

    public function addWorklog(string $issueKey, Request $request): JsonResponse
    {
        if ($response = $this->unsupportedContentType($request)) {
            return $response;
        }

        $data = $request->toArray();
        $payload = new AddWorklogRequest(trim((string) ($data['timeSpent'] ?? '')), $this->nullableString($data, 'comment'));
        if ($response = $this->validationResponse($payload)) {
            return $response;
        }

        return new JsonResponse($this->issues->addIssueWorklog($issueKey, $payload->timeSpent, $payload->comment), 201);
    }

    public function transition(string $issueKey, Request $request): JsonResponse
    {
        if ($response = $this->unsupportedContentType($request)) {
            return $response;
        }

        $data = $request->toArray();
        $payload = new TransitionRequest(is_string($data['transitionId'] ?? null) ? $data['transitionId'] : '', is_int($data['boardId'] ?? null) ? $data['boardId'] : null);
        if ($response = $this->validationResponse($payload)) {
            return $response;
        }

        $this->issues->transitionIssue($issueKey, $payload->transitionId);
        if (null !== $payload->boardId) {
            $this->snapshots->invalidateIssues($payload->boardId);
        }

        return new JsonResponse($this->issues->getIssue($issueKey), headers: ['Cache-Control' => 'no-store']);
    }

    private function validationResponse(object $payload): ?JsonResponse
    {
        $errors = [];
        foreach ($this->validator->validate($payload) as $violation) {
            $errors[$violation->getPropertyPath()] = $violation->getMessage();
        }

        return [] === $errors ? null : new JsonResponse(['errors' => $errors], 422);
    }

    private function unsupportedContentType(Request $request): ?JsonResponse
    {
        if ('' === $request->getContent() || str_starts_with((string) $request->headers->get('Content-Type'), 'application/json')) {
            return null;
        }

        return new JsonResponse(['error' => $this->translator->trans('api.json_required')], Response::HTTP_UNSUPPORTED_MEDIA_TYPE);
    }

    /** @param array<string, mixed> $data */
    private function nullableString(array $data, string $key): ?string
    {
        $value = trim((string) ($data[$key] ?? ''));

        return '' === $value ? null : $value;
    }

    /** @param array<string, mixed> $data */
    private function commentRequest(array $data): AddCommentRequest
    {
        return new AddCommentRequest(trim((string) ($data['comment'] ?? '')), $this->mentionsFromRequest($data));
    }

    /**
     * @param array<string, mixed> $data
     *
     * @return array<string, array<string, string>|list<string>|string|null>
     */
    private function editableFields(array $data, UpdateIssueRequest $payload): array
    {
        $fields = [];
        if (array_key_exists('summary', $data)) {
            $fields['summary'] = $payload->summary;
        }
        if (array_key_exists('description', $data)) {
            $fields['description'] = '' === $payload->description ? null : $this->documents->plainTextDocument((string) $payload->description);
        }
        if (array_key_exists('labels', $data)) {
            $labels = is_array($payload->labels) ? $payload->labels : [];
            $fields['labels'] = array_values(array_unique(array_filter(array_map(static fn (mixed $label): string => trim((string) $label), $labels), static fn (string $label): bool => '' !== $label)));
        }
        if (array_key_exists('dueDate', $data)) {
            $fields['duedate'] = $payload->dueDate;
        }
        $timeTracking = [];
        foreach (['originalEstimate', 'remainingEstimate'] as $input) {
            if (array_key_exists($input, $data) && null !== $payload->{$input}) {
                $timeTracking[$input] = $payload->{$input};
            }
        }
        if ([] !== $timeTracking) {
            $fields['timetracking'] = $timeTracking;
        }

        return $fields;
    }

    /** @param array<string, mixed> $data
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
            if ('' === $accountId || '' === $text || !str_starts_with($text, '@') || mb_strlen($accountId) > 255 || mb_strlen($text) > 160) {
                continue;
            }
            $mentions[$accountId] = ['accountId' => $accountId, 'text' => $text];
        }

        return array_values($mentions);
    }
}
