<?php

declare(strict_types=1);

namespace App\EventSubscriber;

use App\Observability\RequestIdProvider;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;

final readonly class RequestIdSubscriber implements EventSubscriberInterface
{
    public function __construct(private RequestIdProvider $requestIdProvider)
    {
    }

    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::REQUEST => 'onRequest', KernelEvents::RESPONSE => 'onResponse'];
    }

    public function onRequest(RequestEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }

        $this->requestIdProvider->setRequestId(bin2hex(random_bytes(12)));
    }

    public function onResponse(ResponseEvent $event): void
    {
        if ($event->isMainRequest()) {
            $event->getResponse()->headers->set('X-Request-Id', $this->requestIdProvider->getRequestId());
        }
    }
}
