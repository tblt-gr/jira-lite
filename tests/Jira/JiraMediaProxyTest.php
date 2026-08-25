<?php

namespace App\Tests\Jira;

use App\Jira\JiraMediaProxy;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpClient\MockHttpClient;
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
        $this->expectException(\InvalidArgumentException::class);

        $this->proxy()->isAllowedUrl('https://example.org/image.png');
    }

    private function proxy(): JiraMediaProxy
    {
        return new JiraMediaProxy(
            new MockHttpClient(),
            'https://jira.example.test',
            'user@example.com',
            'token',
            new Translator('fr')
        );
    }
}
