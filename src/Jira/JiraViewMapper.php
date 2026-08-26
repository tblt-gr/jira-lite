<?php

declare(strict_types=1);

namespace App\Jira;

use App\Jira\Dto\BoardIssue;

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
    ];

    public function __construct(
        private readonly string $storyPointsField,
        private readonly string $fallbackStoryPointsField,
    ) {
    }

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
            fn (mixed $issue): ?BoardIssue => is_array($issue)
                ? $this->boardIssue($issue, $names)
                : null,
            $issues
        )));

        return $response;
    }

    /**
     * @param array<string, mixed> $issue
     * @param array<string, mixed> $names
     */
    public function boardIssue(array $issue, array $names = []): BoardIssue
    {
        $fieldNames = [
            ...$names,
            ...(is_array($issue['names'] ?? null) ? $issue['names'] : []),
        ];
        $allowedFields = array_fill_keys([
            ...self::BOARD_FIELDS,
            $this->storyPointsField,
            $this->fallbackStoryPointsField,
        ], true);

        foreach ($fieldNames as $fieldId => $fieldName) {
            if (preg_match(
                '/epic|sprint|story point|points d.?effort/i',
                (string) $fieldName
            )) {
                $allowedFields[(string) $fieldId] = true;
            }
        }

        return BoardIssue::fromJira($issue, array_keys($allowedFields));
    }
}
