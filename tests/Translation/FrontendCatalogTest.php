<?php

declare(strict_types=1);

namespace App\Tests\Translation;

use const JSON_THROW_ON_ERROR;

use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Twig\Environment;

final class FrontendCatalogTest extends KernelTestCase
{
    public function testFrontendCatalogContainsTranslatedMessages(): void
    {
        self::bootKernel();
        $twig = self::getContainer()->get(Environment::class);
        $html = $twig->render('board/_translations.html.twig');

        $matched = preg_match(
            '/<script[^>]*>(.*)<\/script>/s',
            $html,
            $matches
        );
        self::assertSame(1, $matched);
        $catalog = json_decode(
            trim($matches[1]),
            true,
            flags: JSON_THROW_ON_ERROR
        );

        self::assertSame('Chargement…', $catalog['board.loading']);
        self::assertSame(
            'Ticket mis à jour',
            $catalog['dialog.issue_updated']
        );
        self::assertArrayHasKey('api.http_error', $catalog);
    }
}
