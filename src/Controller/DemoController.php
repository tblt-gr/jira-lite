<?php

declare(strict_types=1);

namespace App\Controller;

use App\Demo\DemoDataProvider;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/demo')]
final class DemoController extends AbstractController
{
    public function __construct(private readonly DemoDataProvider $demo)
    {
    }

    #[Route('', name: 'app_demo_home', methods: ['GET'])]
    public function index(): Response
    {
        return $this->render('home.html.twig', [
            'boards' => $this->demo->boards(),
            'error' => null,
            'home_route' => 'app_demo_home',
            'board_route' => 'app_demo_board',
        ]);
    }

    #[Route(
        '/boards/{boardId}',
        name: 'app_demo_board',
        requirements: ['boardId' => '\\d+'],
        methods: ['GET'],
    )]
    public function board(int $boardId): Response
    {
        $this->demo->snapshot($boardId);

        return $this->render('board.html.twig', [
            'boardId' => $boardId,
            'boards' => $this->demo->boards(),
            'home_route' => 'app_demo_home',
            'board_route' => 'app_demo_board',
            'api_base_url' => '/api/demo',
            'read_only' => true,
        ]);
    }
}
