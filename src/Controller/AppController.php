<?php

declare(strict_types=1);

namespace App\Controller;

use App\Jira\Repository\BoardRepository;
use Collator;

use function is_int;
use function is_string;

use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Contracts\Cache\CacheInterface;
use Symfony\Contracts\Cache\ItemInterface;
use Symfony\Contracts\Translation\TranslatorInterface;
use Throwable;

final class AppController extends AbstractController
{
    public function __construct(private readonly LoggerInterface $logger)
    {
    }

    #[Route('/', name: 'app_home', methods: ['GET'])]
    public function index(
        BoardRepository $jira,
        CacheInterface $cache,
        TranslatorInterface $translator,
    ): Response {
        try {
            $boards = $this->boards($jira, $cache);
            $error = null;
        } catch (Throwable $exception) {
            $this->logger->error('Unable to load Jira boards.', [
                'exception' => $exception,
            ]);
            $boards = [];
            $error = $translator->trans('home.load_error');
        }

        return $this->render('home.html.twig', [
            'boards' => $boards,
            'error' => $error,
        ]);
    }

    #[Route(
        '/boards/{boardId}',
        name: 'app_board',
        requirements: ['boardId' => '\\d+'],
        methods: ['GET'],
    )]
    public function board(
        int $boardId,
        BoardRepository $jira,
        CacheInterface $cache,
    ): Response {
        try {
            $boards = $this->boards($jira, $cache);
        } catch (Throwable $exception) {
            $this->logger->error('Unable to load Jira boards.', [
                'exception' => $exception,
            ]);
            $boards = [];
        }

        return $this->render('board.html.twig', [
            'boardId' => $boardId,
            'boards' => $boards,
        ]);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function boards(
        BoardRepository $jira,
        CacheInterface $cache,
    ): array {
        /** @var list<array<string, mixed>> $boards */
        $boards = $cache->get(
            'jira.boards',
            static function (ItemInterface $item) use ($jira): array {
                $item->expiresAfter(300);

                return $jira->getBoards();
            }
        );

        // Collator gère les accents ; repli sur une comparaison naturelle.
        $collator = class_exists(Collator::class)
            ? new Collator('fr_FR')
            : null;

        usort($boards, static function (
            array $first,
            array $second,
        ) use ($collator): int {
            $firstName = is_string($first['name'] ?? null)
                ? $first['name']
                : '';
            $secondName = is_string($second['name'] ?? null)
                ? $second['name']
                : '';

            $compared = $collator?->compare($firstName, $secondName);

            return is_int($compared)
                ? $compared
                : strnatcasecmp($firstName, $secondName);
        });

        return $boards;
    }
}
