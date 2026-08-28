<?php

declare(strict_types=1);

namespace App\Controller;

use App\Demo\DemoDataProvider;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/demo')]
final class DemoApiController
{
    public function __construct(private readonly DemoDataProvider $demo)
    {
    }

    #[Route('/board/{boardId}', methods: ['GET'])]
    public function board(int $boardId): JsonResponse
    {
        return new JsonResponse($this->demo->snapshot($boardId));
    }

    #[Route('/board/{boardId}/changes', methods: ['GET'])]
    public function changes(int $boardId): JsonResponse
    {
        return new JsonResponse(
            $this->demo->changes($boardId),
            headers: ['Cache-Control' => 'no-store'],
        );
    }

    #[Route('/issue/{issueKey}', methods: ['GET'])]
    public function issue(string $issueKey): JsonResponse
    {
        return new JsonResponse(
            $this->demo->issue($issueKey),
            headers: ['Cache-Control' => 'no-store'],
        );
    }

    #[Route('/issue/{issueKey}/transitions', methods: ['GET'])]
    public function transitions(string $issueKey): JsonResponse
    {
        return new JsonResponse($this->demo->transitions($issueKey));
    }

    #[Route('/issue/{issueKey}/comments', methods: ['GET'])]
    public function comments(string $issueKey): JsonResponse
    {
        return new JsonResponse($this->demo->comments($issueKey));
    }

    #[Route('/users', methods: ['GET'])]
    public function users(Request $request): JsonResponse
    {
        return new JsonResponse(['users' => $this->demo->users(
            $request->query->getString('query'),
        )]);
    }
}
