<?php

declare(strict_types=1);

namespace App\Tests\Jira;

use App\Jira\JiraMediaProxy;

use function count;

use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;
use Symfony\Component\Translation\Translator;

final class JiraMediaProxyTest extends TestCase
{
    #[DataProvider('allowedUrls')]
    public function testItAcceptsKnownMediaHosts(string $url, bool $jira): void
    {
        self::assertSame($jira, $this->proxy()->isAllowedUrl($url));
    }

    /** @return iterable<string, array{string, bool}> */
    public static function allowedUrls(): iterable
    {
        yield 'jira' => ['https://jira.example.test/avatar.png', true];
        yield 'atlassian media' => [
            'https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/a.png',
            false,
        ];
        yield 'gravatar' => ['https://secure.gravatar.com/avatar/a', false];
    }

    public function testItRejectsUnknownHosts(): void
    {
        $this->expectException(InvalidArgumentException::class);

        $this->proxy()->isAllowedUrl('https://example.org/image.png');
    }

    #[DataProvider('rejectedUrls')]
    public function testItRejectsUnsafeUrls(string $url): void
    {
        $this->expectException(InvalidArgumentException::class);

        $this->proxy()->isAllowedUrl($url);
    }

    /** @return iterable<string, array{string}> */
    public static function rejectedUrls(): iterable
    {
        yield 'http scheme' => ['http://evil.test/image.png'];
        yield 'explicit port' => ['https://evil.test:8443/image.png'];
        yield 'internal address' => ['http://169.254.169.254/image.png'];
    }

    public function testItDoesNotForwardCredentialsToAllowedMediaHosts(): void
    {
        $requests = [];
        $proxy = $this->proxy(new MockHttpClient(static function (
            string $method,
            string $url,
            array $options,
        ) use (&$requests): MockResponse {
            $requests[] = $options;

            return new MockResponse('image', [
                'response_headers' => ['content-type: image/png'],
            ]);
        }));

        $proxy->getMedia('https://secure.gravatar.com/avatar/a');

        self::assertArrayNotHasKey('auth_basic', $requests[0]);
    }

    public function testItRejectsRedirectsToUnsafeHosts(): void
    {
        $proxy = $this->proxy(new MockHttpClient([
            new MockResponse(str_repeat('x', 5_000_001), [
                'http_code' => 302,
                'response_headers' => ['location: https://evil.test/image.png'],
            ]),
        ]));

        $this->expectException(InvalidArgumentException::class);
        $proxy->getMedia('https://jira.example.test/image.png');
    }

    public function testItResolvesRelativeRedirects(): void
    {
        $urls = [];
        $proxy = $this->proxy(new MockHttpClient(static function (
            string $method,
            string $url,
        ) use (&$urls): MockResponse {
            $urls[] = $url;

            return 1 === count($urls)
                ? new MockResponse('', [
                    'http_code' => 302,
                    'response_headers' => ['location: ../final.png'],
                ])
                : new MockResponse('image', [
                    'response_headers' => ['content-type: image/png'],
                ]);
        }));

        $proxy->getMedia('https://jira.example.test/path/source.png');

        self::assertSame('https://jira.example.test/final.png', $urls[1]);
    }

    public function testItRejectsMediaWithAnExcessiveDeclaredSize(): void
    {
        $proxy = $this->proxy(new MockHttpClient([
            new MockResponse('', [
                'response_headers' => [
                    'content-type: image/png',
                    'content-length: 5000001',
                ],
            ]),
        ]));

        $this->expectException(RuntimeException::class);
        $proxy->getMedia('https://jira.example.test/image.png');
    }

    public function testItRejectsMediaWithAnExcessiveBody(): void
    {
        $proxy = $this->proxy(new MockHttpClient([
            new MockResponse(str_repeat('x', 5_000_001), [
                'response_headers' => ['content-type: image/png'],
            ]),
        ]));

        $this->expectException(RuntimeException::class);
        $proxy->getMedia('https://jira.example.test/image.png');
    }

    public function testItRejectsInvalidAttachmentIds(): void
    {
        $this->expectException(InvalidArgumentException::class);

        $this->proxy()->getAttachmentImage('abc', true);
    }

    private function proxy(?MockHttpClient $client = null): JiraMediaProxy
    {
        return new JiraMediaProxy(
            $client ?? new MockHttpClient(),
            'https://jira.example.test',
            'user@example.com',
            'token',
            new Translator('fr')
        );
    }
}
