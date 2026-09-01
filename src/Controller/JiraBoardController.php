<?php

declare(strict_types=1);

namespace App\Controller;

use App\Board\BoardSnapshotProvider;
use App\Service\JiraApiRequestHandler;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsCsrfTokenValid;

#[Route('/api/jira/board')]
final class JiraBoardController
{
    public function __construct(
        private readonly BoardSnapshotProvider $snapshots,
        private readonly JiraApiRequestHandler $handler,
    ) {
    }

    #[Route('/{boardId}', methods: ['GET'])]
    public function board(int $boardId): JsonResponse
    {
        return new JsonResponse($this->snapshots->getSnapshot($boardId));
    }

    #[Route('/{boardId}/metadata', methods: ['GET'])]
    public function metadata(int $boardId): JsonResponse
    {
        return $this->handler->boardMetadata($boardId);
    }

    #[Route('/{boardId}/changes', methods: ['GET'])]
    public function changes(int $boardId, Request $request): JsonResponse
    {
        return $this->handler->changes($boardId, $request);
    }

    #[Route('/{boardId}/create-metadata', methods: ['GET'])]
    public function createMetadata(int $boardId): JsonResponse
    {
        return $this->handler->createMetadata($boardId);
    }

    #[Route('/{boardId}/issues', methods: ['POST'])]
    #[IsCsrfTokenValid('jira_api', tokenKey: 'X-CSRF-Token', tokenSource: IsCsrfTokenValid::SOURCE_HEADER)]
    public function createIssue(int $boardId, Request $request): JsonResponse
    {
        return $this->handler->createIssue($boardId, $request);
    }
}
