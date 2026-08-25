<?php

declare(strict_types=1);

namespace App\Jira;

use function dirname;

use const FILEINFO_MIME_TYPE;

use finfo;

use function in_array;

use InvalidArgumentException;

use function is_string;

use const PHP_URL_SCHEME;

use RuntimeException;

use function sprintf;
use function strlen;

use Symfony\Contracts\HttpClient\HttpClientInterface;
use Symfony\Contracts\Translation\TranslatorInterface;

final class JiraMediaProxy
{
    private const MAX_MEDIA_SIZE = 5_000_000;
    private const IMAGE_CONTENT_TYPES = [
        'image/avif', 'image/gif', 'image/jpeg', 'image/png',
        'image/svg+xml', 'image/webp', 'image/x-icon',
        'image/vnd.microsoft.icon',
    ];
    private const MEDIA_HOST_SUFFIXES = ['.atlassian.com', '.atl-paas.net'];
    private const MEDIA_HOSTS = ['secure.gravatar.com', 'www.gravatar.com'];

    public function __construct(
        private readonly HttpClientInterface $client,
        private readonly string $baseUrl,
        private readonly string $email,
        private readonly string $apiToken,
        private readonly TranslatorInterface $translator,
    ) {
    }

    /** @return array{content: string, contentType: string} */
    public function getAttachmentImage(
        string $attachmentId,
        bool $thumbnail,
    ): array {
        if ('' === $attachmentId || !ctype_digit($attachmentId)) {
            throw new InvalidArgumentException($this->translator->trans('media.invalid_attachment'));
        }

        $path = $thumbnail
            ? sprintf(
                '/rest/api/3/attachment/thumbnail/%s',
                rawurlencode($attachmentId)
            )
            : sprintf(
                '/rest/api/3/attachment/content/%s',
                rawurlencode($attachmentId)
            );
        $query = $thumbnail
            ? '?redirect=false&fallbackToDefault=true&width=1200&height=1200'
            : '?redirect=false';

        return $this->getMedia(rtrim($this->baseUrl, '/').$path.$query);
    }

    /** @return array{content: string, contentType: string} */
    public function getMedia(string $url): array
    {
        if (str_starts_with($url, '/')) {
            $url = rtrim($this->baseUrl, '/').$url;
        }

        for ($redirects = 0; $redirects <= 3; ++$redirects) {
            $isJiraHost = $this->validateMediaUrl($url);
            $options = [
                'headers' => ['Accept' => '*/*'],
                'max_redirects' => 0,
            ];

            if ($isJiraHost) {
                $options['auth_basic'] = [$this->email, $this->apiToken];
            }

            $response = $this->client->request('GET', $url, $options);
            $status = $response->getStatusCode();
            $headers = $response->getHeaders(false);

            if ($status >= 300 && $status < 400) {
                $location = $headers['location'][0] ?? null;

                if (!is_string($location) || '' === $location) {
                    throw new RuntimeException($this->translator->trans('media.invalid_redirect'));
                }

                $url = $this->resolveMediaRedirect($url, $location);
                continue;
            }

            if ($status < 200 || $status >= 300) {
                throw new RuntimeException($this->translator->trans('media.unavailable'));
            }

            $contentType = strtolower(trim(explode(
                ';',
                (string) ($headers['content-type'][0] ?? '')
            )[0]));
            $declaredSize = (int) ($headers['content-length'][0] ?? 0);

            if ($declaredSize > self::MAX_MEDIA_SIZE) {
                throw new RuntimeException($this->translator->trans('media.too_large'));
            }

            $content = $response->getContent(false);

            if (strlen($content) > self::MAX_MEDIA_SIZE) {
                throw new RuntimeException($this->translator->trans('media.too_large'));
            }

            if (!in_array($contentType, self::IMAGE_CONTENT_TYPES, true)) {
                $detectedType = class_exists(finfo::class)
                    ? (new finfo(FILEINFO_MIME_TYPE))->buffer($content)
                    : false;

                if (
                    !is_string($detectedType)
                    || !in_array(
                        $detectedType,
                        self::IMAGE_CONTENT_TYPES,
                        true
                    )
                ) {
                    throw new RuntimeException($this->translator->trans('media.type_not_allowed'));
                }

                $contentType = $detectedType;
            }

            return ['content' => $content, 'contentType' => $contentType];
        }

        throw new RuntimeException($this->translator->trans('media.too_many_redirects'));
    }

    public function isAllowedUrl(string $url): bool
    {
        return $this->validateMediaUrl($url);
    }

    private function validateMediaUrl(string $url): bool
    {
        $parts = parse_url($url);
        $baseParts = parse_url($this->baseUrl);
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower((string) ($parts['host'] ?? ''));
        $baseScheme = strtolower((string) ($baseParts['scheme'] ?? ''));
        $baseHost = strtolower((string) ($baseParts['host'] ?? ''));
        $port = $parts['port'] ?? null;
        $basePort = $baseParts['port'] ?? null;
        $isJiraHost = '' !== $host
            && hash_equals($baseHost, $host)
            && $scheme === $baseScheme
            && $port === $basePort;

        if ($isJiraHost) {
            return true;
        }

        if ('https' !== $scheme || null !== $port) {
            throw new InvalidArgumentException($this->translator->trans('media.url_not_allowed'));
        }

        if (in_array($host, self::MEDIA_HOSTS, true)) {
            return false;
        }

        foreach (self::MEDIA_HOST_SUFFIXES as $suffix) {
            if (str_ends_with($host, $suffix)) {
                return false;
            }
        }

        throw new InvalidArgumentException($this->translator->trans('media.domain_not_allowed'));
    }

    private function resolveMediaRedirect(string $source, string $location): string
    {
        if (null !== parse_url($location, PHP_URL_SCHEME)) {
            return $location;
        }

        $parts = parse_url($source);
        $origin = sprintf(
            '%s://%s%s',
            $parts['scheme'],
            $parts['host'],
            isset($parts['port']) ? ':'.$parts['port'] : ''
        );

        if (str_starts_with($location, '//')) {
            return $parts['scheme'].':'.$location;
        }

        if (str_starts_with($location, '/')) {
            return $origin.$location;
        }

        $path = (string) ($parts['path'] ?? '/');

        return $origin.rtrim(dirname($path), '/').'/'.$location;
    }
}
