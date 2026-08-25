<?php

namespace App\Controller;

use App\Service\JiraApiService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Contracts\Cache\CacheInterface;
use Symfony\Contracts\Cache\ItemInterface;
use Symfony\Contracts\Translation\TranslatorInterface;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class AppController extends AbstractController
{
    #[Route('/', name: 'app_home', methods: ['GET'])]
    public function index(
        JiraApiService $jira,
        CacheInterface $cache,
        TranslatorInterface $translator,
    ): Response {
        try {
            $boards = $cache->get(
                'jira.boards',
                function (ItemInterface $item) use ($jira): array {
                    $item->expiresAfter(300);

                    return $jira->getBoards();
                }
            );
            $error = null;
        } catch (\Throwable) {
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
    public function board(int $boardId): Response
    {
        return $this->render('board.html.twig', [
            'boardId' => $boardId,
        ]);
    }
}
