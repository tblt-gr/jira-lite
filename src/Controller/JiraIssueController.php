<?php

declare(strict_types=1);

namespace App\Controller;

use App\Jira\Repository\IssueRepository;
use App\Jira\Repository\UserRepository;
use App\Service\JiraApiRequestHandler;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsCsrfTokenValid;

#[Route('/api/jira')]
final class JiraIssueController
{
    public function __construct(
        private readonly IssueRepository $issues,
        private readonly UserRepository $users,
        private readonly JiraApiRequestHandler $handler,
    ) {
    }

    #[Route('/issue/{issueKey}', methods: ['GET'])]
    public function issue(string $issueKey): JsonResponse
    {
        return new JsonResponse($this->issues->getIssue($issueKey), headers: ['Cache-Control' => 'no-store']);
    }

    #[Route('/issue/{issueKey}/transitions', methods: ['GET'])]
    public function transitions(string $issueKey): JsonResponse
    {
        return new JsonResponse($this->issues->getTransitions($issueKey));
    }

    #[Route('/users', methods: ['GET'])]
    public function users(Request $request): JsonResponse
    {
        $query = trim($request->query->getString('query'));

        return new JsonResponse(['users' => '' === $query || mb_strlen($query) > 80 ? [] : $this->users->searchUsers($query)]);
    }

    #[Route('/issue/{issueKey}', methods: ['PATCH'])]
    #[IsCsrfTokenValid('jira_api', tokenKey: 'X-CSRF-Token', tokenSource: IsCsrfTokenValid::SOURCE_HEADER)]
    public function updateIssue(string $issueKey, Request $request): JsonResponse
    {
        return $this->handler->updateIssue($issueKey, $request);
    }

    #[Route('/issue/{issueKey}/transition', methods: ['POST'])]
    #[IsCsrfTokenValid('jira_api', tokenKey: 'X-CSRF-Token', tokenSource: IsCsrfTokenValid::SOURCE_HEADER)]
    public function transition(string $issueKey, Request $request): JsonResponse
    {
        return $this->handler->transition($issueKey, $request);
    }
}
