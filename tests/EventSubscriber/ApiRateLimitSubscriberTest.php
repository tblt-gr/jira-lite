<?php

declare(strict_types=1);

namespace App\Tests\EventSubscriber;

use App\EventSubscriber\ApiRateLimitSubscriber;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\HttpKernelInterface;
use Symfony\Component\RateLimiter\RateLimiterFactory;
use Symfony\Component\RateLimiter\Storage\InMemoryStorage;
use Symfony\Component\Translation\Translator;

final class ApiRateLimitSubscriberTest extends TestCase
{
    public function testItIgnoresRoutesOutsideTheJiraApi(): void
    {
        $event = $this->requestEvent('/health', 'GET');

        $this->subscriber()->onRequest($event);

        self::assertNull($event->getResponse());
    }

    public function testItUsesSeparateReadAndWriteLimiters(): void
    {
        $subscriber = $this->subscriber();
        $readEvent = $this->requestEvent('/api/jira/board/1', 'GET');
        $writeEvent = $this->requestEvent('/api/jira/issue/APP-1', 'PATCH');

        $subscriber->onRequest($readEvent);
        $subscriber->onRequest($writeEvent);

        self::assertNull($readEvent->getResponse());
        self::assertNull($writeEvent->getResponse());
    }

    public function testItReturnsRetryAfterWhenTheLimitIsExceeded(): void
    {
        $subscriber = $this->subscriber();
        $subscriber->onRequest($this->requestEvent('/api/jira/board/1', 'GET'));
        $event = $this->requestEvent('/api/jira/board/1', 'GET');

        $subscriber->onRequest($event);

        $response = $event->getResponse();

        self::assertNotNull($response);
        self::assertSame(429, $response->getStatusCode());
        self::assertGreaterThanOrEqual(1, (int) $response->headers->get('Retry-After'));
    }

    private function subscriber(): ApiRateLimitSubscriber
    {
        $storage = new InMemoryStorage();
        $translator = new Translator('en');

        return new ApiRateLimitSubscriber(
            new RateLimiterFactory([
                'id' => 'read', 'policy' => 'sliding_window',
                'limit' => 1, 'interval' => '1 minute',
            ], $storage),
            new RateLimiterFactory([
                'id' => 'write', 'policy' => 'sliding_window',
                'limit' => 1, 'interval' => '1 minute',
            ], $storage),
            $translator,
        );
    }

    private function requestEvent(string $path, string $method): RequestEvent
    {
        return new RequestEvent(
            $this->createMock(HttpKernelInterface::class),
            Request::create($path, $method, server: ['REMOTE_ADDR' => '127.0.0.1']),
            HttpKernelInterface::MAIN_REQUEST,
        );
    }
}
