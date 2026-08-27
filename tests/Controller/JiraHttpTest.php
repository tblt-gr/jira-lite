<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use const JSON_THROW_ON_ERROR;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class JiraHttpTest extends WebTestCase
{
    public function testItRejectsAnUntrustedHost(): void
    {
        $client = static::createClient();
        $client->request('GET', '/health', server: ['HTTP_HOST' => 'evil.test']);

        self::assertResponseStatusCodeSame(400);
    }

    public function testMutatingRoutesRequireAStatelessCsrfToken(): void
    {
        $client = static::createClient();
        $client->request(
            'POST',
            '/api/jira/issue/APP-1/transition',
            server: ['CONTENT_TYPE' => 'application/json'],
            content: '{}'
        );

        self::assertResponseStatusCodeSame(403);
    }

    public function testMutatingRoutesRejectNonJsonBodiesAfterCsrfValidation(): void
    {
        $client = static::createClient();
        $crawler = $client->request('GET', '/');
        $token = $crawler->filterXPath('//meta[@name="csrf-token"]')->attr('content');

        self::assertNotNull($token);
        $client->request(
            'POST',
            '/api/jira/issue/APP-1/transition',
            server: [
                'CONTENT_TYPE' => 'text/plain',
                'HTTP_X_CSRF_TOKEN' => $token,
            ],
            content: '{}'
        );

        self::assertResponseStatusCodeSame(415);
    }

    public function testItUsesEnglishForAnEnglishAcceptLanguageHeader(): void
    {
        $client = static::createClient();
        $crawler = $client->request(
            'GET',
            '/',
            server: ['HTTP_ACCEPT_LANGUAGE' => 'en']
        );

        self::assertResponseIsSuccessful();
        self::assertStringContainsString(
            'Choose a board',
            $crawler->filterXPath('//h1')->text()
        );
        self::assertCount(1, $crawler->filterXPath('//html[@lang="en"]'));
    }

    public function testValidationFailuresUseTheFrontendErrorContract(): void
    {
        $client = static::createClient();
        $crawler = $client->request('GET', '/');
        $token = $crawler->filterXPath('//meta[@name="csrf-token"]')->attr('content');

        $client->request(
            'POST',
            '/api/jira/issue/APP-1/worklogs',
            server: [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_X_CSRF_TOKEN' => $token,
            ],
            content: json_encode(['timeSpent' => '1x'], JSON_THROW_ON_ERROR)
        );

        self::assertResponseStatusCodeSame(422);
        self::assertSame(
            ['errors' => ['timeSpent' => 'This value is not a valid Jira duration.']],
            json_decode(
                (string) $client->getResponse()->getContent(),
                true,
                flags: JSON_THROW_ON_ERROR
            )
        );
    }
}
