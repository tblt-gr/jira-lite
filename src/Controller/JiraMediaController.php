<?php

declare(strict_types=1);

namespace App\Controller;

use App\Jira\JiraMediaProxy;
use InvalidArgumentException;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Throwable;

#[Route('/api/jira')]
final class JiraMediaController
{
    public function __construct(private readonly JiraMediaProxy $mediaProxy)
    {
    }

    #[Route('/media', methods: ['GET'])]
    public function media(Request $request): Response
    {
        $url = $request->query->getString('url');

        return '' === $url ? new Response(status: 400) : $this->respond(fn (): array => $this->mediaProxy->getMedia($url));
    }

    #[Route('/attachment/{attachmentId}/{variant}', requirements: ['attachmentId' => '\\d+', 'variant' => 'thumbnail|content'], methods: ['GET'])]
    public function attachmentMedia(string $attachmentId, string $variant): Response
    {
        return $this->respond(fn (): array => $this->mediaProxy->getAttachmentImage($attachmentId, 'thumbnail' === $variant));
    }

    /** @param callable(): array{content: string, contentType: string} $getMedia */
    private function respond(callable $getMedia): Response
    {
        try {
            $media = $getMedia();
        } catch (InvalidArgumentException) {
            return new Response(status: 400);
        } catch (Throwable) {
            return new Response(status: 502);
        }

        return new Response($media['content'], headers: [
            'Content-Type' => $media['contentType'], 'Content-Disposition' => 'inline', 'Cache-Control' => 'private, max-age=3600', 'Content-Security-Policy' => "default-src 'none'; sandbox", 'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
