<?php

declare(strict_types=1);

namespace App\Jira;

use function is_array;

final class JiraViewMapper
{
    private const BOARD_FIELDS = [
        'summary',
        'status',
        'statusCategory',
        'issuetype',
        'fixVersions',
        'priority',
        'labels',
        'assignee',
        'sprint',
        'storyPoints',
        'customfield_10016',
        'customfield_10026',
    ];

    /**
     * @param array<string, mixed> $response
     *
     * @return array<string, mixed>
     */
    public function boardIssues(array $response): array
    {
        $names = is_array($response['names'] ?? null)
            ? $response['names']
            : [];
        $issues = is_array($response['issues'] ?? null)
            ? $response['issues']
            : [];
        $response['issues'] = array_values(array_filter(array_map(
            fn (mixed $issue): ?array => is_array($issue)
                ? $this->boardIssue($issue, $names)
                : null,
            $issues
        )));

        return $response;
    }

    /**
     * @param array<string, mixed> $issue
     * @param array<string, mixed> $names
     *
     * @return array<string, mixed>
     */
    public function boardIssue(array $issue, array $names = []): array
    {
        $sourceFields = is_array($issue['fields'] ?? null)
            ? $issue['fields']
            : [];
        $fieldNames = [
            ...$names,
            ...(is_array($issue['names'] ?? null) ? $issue['names'] : []),
        ];
        $allowedFields = array_fill_keys(self::BOARD_FIELDS, true);

        foreach ($fieldNames as $fieldId => $fieldName) {
            if (preg_match(
                '/epic|sprint|story point|points d.?effort/i',
                (string) $fieldName
            )) {
                $allowedFields[(string) $fieldId] = true;
            }
        }

        return array_filter([
            'id' => $issue['id'] ?? null,
            'key' => $issue['key'] ?? null,
            'self' => $issue['self'] ?? null,
            'fields' => array_intersect_key($sourceFields, $allowedFields),
        ], static fn (mixed $value): bool => null !== $value);
    }
}
