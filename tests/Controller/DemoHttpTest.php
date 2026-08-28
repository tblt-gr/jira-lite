<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Demo\DemoDataProvider;

use const JSON_THROW_ON_ERROR;

use function sprintf;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class DemoHttpTest extends WebTestCase
{
    public function testDemoHomeLinksToBothDedicatedBoards(): void
    {
        $client = static::createClient();
        $crawler = $client->request('GET', '/demo');

        self::assertResponseIsSuccessful();
        self::assertCount(2, $crawler->filterXPath(
            '//a[contains(concat(" ", normalize-space(@class), " "), " home-board-card ")]',
        ));
        self::assertCount(1, $crawler->filterXPath(sprintf(
            '//a[@href="/demo/boards/%d"]',
            DemoDataProvider::POPULATED_BOARD_ID,
        )));
        self::assertCount(1, $crawler->filterXPath(sprintf(
            '//a[@href="/demo/boards/%d"]',
            DemoDataProvider::EMPTY_BOARD_ID,
        )));
    }

    public function testDemoBoardConfiguresTheDedicatedReadOnlyClient(): void
    {
        $client = static::createClient();
        $crawler = $client->request(
            'GET',
            sprintf('/demo/boards/%d', DemoDataProvider::POPULATED_BOARD_ID),
        );

        self::assertResponseIsSuccessful();
        $body = $crawler->filterXPath('//body[@data-controller="board"]');
        self::assertSame('/api/demo', $body->attr(
            'data-board-api-base-url-value',
        ));
        self::assertSame('true', $body->attr(
            'data-board-read-only-value',
        ));
        self::assertCount(1, $crawler->filterXPath(
            '//*[@id="create-issue" and @hidden]',
        ));
        self::assertCount(1, $crawler->filterXPath(
            '//*[@id="comment-form" and @hidden]',
        ));
    }

    public function testDemoApiProvidesPopulatedAndEmptySnapshots(): void
    {
        $client = static::createClient();
        $client->request('GET', sprintf(
            '/api/demo/board/%d',
            DemoDataProvider::POPULATED_BOARD_ID,
        ));

        self::assertResponseIsSuccessful();
        $populated = json_decode(
            (string) $client->getResponse()->getContent(),
            true,
            flags: JSON_THROW_ON_ERROR,
        );
        self::assertCount(8, $populated['issues']['issues']);
        self::assertCount(2, $populated['epics']['values']);

        $client->request('GET', sprintf(
            '/api/demo/board/%d',
            DemoDataProvider::EMPTY_BOARD_ID,
        ));
        $empty = json_decode(
            (string) $client->getResponse()->getContent(),
            true,
            flags: JSON_THROW_ON_ERROR,
        );
        self::assertSame([], $empty['issues']['issues']);
        self::assertSame([], $empty['epics']['values']);
    }

    public function testDemoIssuesAreNavigableButNotWritable(): void
    {
        $client = static::createClient();
        $client->request('GET', '/api/demo/issue/NIM-121');
        self::assertResponseIsSuccessful();

        $client->request('GET', '/api/demo/issue/NIM-121/comments');
        self::assertResponseIsSuccessful();

        $client->request('POST', '/api/demo/issue/NIM-121');
        self::assertResponseStatusCodeSame(405);

        $client->request('GET', '/api/demo/issue/NIM-999');
        self::assertResponseStatusCodeSame(404);
    }
}
