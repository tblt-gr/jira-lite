<?php

declare(strict_types=1);

namespace App\Controller;

use App\Service\JiraApiRequestHandler;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsCsrfTokenValid;

#[Route('/api/jira/issue/{issueKey}')]
final class JiraCommentController
{
    public function __construct(private readonly JiraApiRequestHandler $handler)
    {
    }

    #[Route('/comments', methods: ['GET'])]
    public function comments(string $issueKey): JsonResponse
    {
        return $this->handler->comments($issueKey);
    }

    #[Route('/comments', methods: ['POST'])]
    #[IsCsrfTokenValid('jira_api', tokenKey: 'X-CSRF-Token', tokenSource: IsCsrfTokenValid::SOURCE_HEADER)]
    public function addComment(string $issueKey, Request $request): JsonResponse
    {
        return $this->handler->addComment($issueKey, $request);
    }

    #[Route('/comments/{commentId}', requirements: ['commentId' => '\\d+'], methods: ['PUT'])]
    #[IsCsrfTokenValid('jira_api', tokenKey: 'X-CSRF-Token', tokenSource: IsCsrfTokenValid::SOURCE_HEADER)]
    public function updateComment(string $issueKey, string $commentId, Request $request): JsonResponse
    {
        return $this->handler->updateComment($issueKey, $commentId, $request);
    }

    #[Route('/comments/{commentId}', requirements: ['commentId' => '\\d+'], methods: ['DELETE'])]
    #[IsCsrfTokenValid('jira_api', tokenKey: 'X-CSRF-Token', tokenSource: IsCsrfTokenValid::SOURCE_HEADER)]
    public function deleteComment(string $issueKey, string $commentId, Request $request): JsonResponse
    {
        return $this->handler->deleteComment($issueKey, $commentId, $request);
    }

    #[Route('/worklogs', methods: ['POST'])]
    #[IsCsrfTokenValid('jira_api', tokenKey: 'X-CSRF-Token', tokenSource: IsCsrfTokenValid::SOURCE_HEADER)]
    public function addWorklog(string $issueKey, Request $request): JsonResponse
    {
        return $this->handler->addWorklog($issueKey, $request);
    }
}
