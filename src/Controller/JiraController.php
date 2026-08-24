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
        return new JsonResponse(
            $this->jira->getIssueComments($issueKey)
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
}
