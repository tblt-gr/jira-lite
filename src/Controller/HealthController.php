<?php

declare(strict_types=1);

namespace App\Controller;

use App\Jira\JiraClient;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

final class HealthController
{
    #[Route('/health', name: 'app_health', methods: ['GET'])]
    public function health(): JsonResponse
    {
        return new JsonResponse([
            'status' => 'ok',
            'version' => 'dev',
        ]);
    }

    #[Route('/health/ready', name: 'app_health_ready', methods: ['GET'])]
    public function ready(JiraClient $jira): JsonResponse
    {
        if ($jira->isAvailable()) {
            return new JsonResponse(['status' => 'ok']);
        }

        return new JsonResponse(['status' => 'unavailable'], 503);
    }
}
