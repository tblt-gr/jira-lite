<?php

declare(strict_types=1);

namespace App\EventSubscriber;

use App\Jira\JiraException;
use Psr\Log\LoggerInterface;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\KernelEvents;
use Symfony\Component\Security\Core\Exception\InvalidCsrfTokenException;
use Symfony\Contracts\Translation\TranslatorInterface;

final readonly class ApiExceptionSubscriber implements EventSubscriberInterface
{
    public function __construct(
        private LoggerInterface $logger,
        private TranslatorInterface $translator,
    ) {
    }

    public function onKernelException(ExceptionEvent $event): void
    {
        if (!str_starts_with($event->getRequest()->getPathInfo(), '/api/jira')) {
            return;
        }

        $exception = $event->getThrowable();

        if ($exception instanceof InvalidCsrfTokenException) {
            $event->setResponse(new JsonResponse([
                'error' => $this->translator->trans('api.csrf_invalid'),
            ], 403));

            return;
        }

        if (!$exception instanceof JiraException) {
            return;
        }

        $status = match ($exception->jiraStatus) {
            404 => 404,
            429 => 429,
            default => 502,
        };
        $message = $this->translator->trans(match ($status) {
            404 => 'api.jira_not_found',
            429 => 'api.jira_rate_limited',
            default => 'api.jira_unavailable',
        });

        $this->logger->error('Jira API request failed.', [
            'exception' => $exception,
            'jira_status' => $exception->jiraStatus,
        ]);

        $event->setResponse(new JsonResponse(['error' => $message], $status));
    }

    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::EXCEPTION => 'onKernelException'];
    }
}
