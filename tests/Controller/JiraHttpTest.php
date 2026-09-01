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

    public function testItRendersALocalIssueRoute(): void
    {
        $client = static::createClient();
        $crawler = $client->request('GET', '/browse/INV-2566');

        self::assertResponseIsSuccessful();
        self::assertCount(1, $crawler->filterXPath('//body[@data-controller="issue"]'));
        self::assertSame(
            'INV-2566',
            $crawler->filterXPath('//body')->attr('data-issue-issue-key-value')
        );
        self::assertSame(
            '/browse/INV-2566',
            $crawler->filterXPath('//*[@id="issue-key"]')->attr('href')
        );
        self::assertSame(
            'INV-2566',
            $crawler->filterXPath('//*[@id="issue-page-key"]')->text()
        );
        self::assertCount(1, $crawler->filterXPath('//section[@id="issue-dialog"]'));
        self::assertCount(0, $crawler->filterXPath('//dialog[@id="issue-dialog"]'));
        self::assertCount(0, $crawler->filterXPath('//*[@id="close-dialog"]'));
    }

    public function testTheIssueRouteKeepsItsOriginatingBoard(): void
    {
        $client = static::createClient();
        $crawler = $client->request('GET', '/browse/INV-2566?board=42');

        self::assertResponseIsSuccessful();
        self::assertSame(
            '42',
            $crawler->filterXPath('//body')->attr('data-issue-board-id-value')
        );
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
