<?php

declare(strict_types=1);

namespace App\Jira\Document;

use function strlen;
use function strpos;
use function substr;
use function trim;

final class AdfDocumentFactory
{
    /**
     * @param list<array{accountId: string, text: string}> $mentions
     *
     * @return array<string, mixed>
     */
    public function plainTextDocument(string $text, array $mentions = []): array
    {
        $paragraphs = preg_split('/\R/u', trim($text)) ?: [];

        return [
            'type' => 'doc',
            'version' => 1,
            'content' => array_map(
                fn (string $paragraph): array => [
                    'type' => 'paragraph',
                    'content' => $this->plainTextInlineContent(
                        $paragraph,
                        $mentions
                    ),
                ],
                $paragraphs
            ),
        ];
    }

    /**
     * @param list<array{accountId: string, text: string}> $mentions
     *
     * @return list<array<string, mixed>>
     */
    private function plainTextInlineContent(
        string $text,
        array $mentions,
    ): array {
        if ('' === $text) {
            return [];
        }

        $content = [];
        $cursor = 0;
        $length = strlen($text);

        while ($cursor < $length) {
            $next = null;

            foreach ($mentions as $mention) {
                $mentionText = $mention['text'];

                if ('' === $mentionText) {
                    continue;
                }

                $position = strpos($text, $mentionText, $cursor);

                if (
                    false !== $position
                    && (null === $next || $position < $next['position'])
                ) {
                    $next = [
                        'position' => $position,
                        'accountId' => (string) $mention['accountId'],
                        'text' => $mentionText,
                    ];
                }
            }

            if (null === $next) {
                $content[] = ['type' => 'text', 'text' => substr($text, $cursor)];
                break;
            }

            if ($next['position'] > $cursor) {
                $content[] = [
                    'type' => 'text',
                    'text' => substr($text, $cursor, $next['position'] - $cursor),
                ];
            }

            $content[] = [
                'type' => 'mention',
                'attrs' => [
                    'id' => $next['accountId'],
                    'text' => $next['text'],
                ],
            ];
            $cursor = $next['position'] + strlen($next['text']);
        }

        return $content;
    }
}
