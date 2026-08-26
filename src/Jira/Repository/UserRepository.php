<?php

declare(strict_types=1);

namespace App\Jira\Repository;

use App\Jira\JiraClient;

use function is_array;

final class UserRepository
{
    public function __construct(private readonly JiraClient $client)
    {
    }

    /** @return array<string, mixed> */
    public function getCurrentUser(): array
    {
        return $this->client->request('GET', '/rest/api/3/myself');
    }

    /**
     * @return list<array{accountId: string, displayName: string, avatarUrl: ?string}>
     */
    public function searchUsers(string $query): array
    {
        $response = $this->client->request('GET', '/rest/api/3/user/picker', [
            'query' => [
                'query' => $query,
                'maxResults' => 10,
                'showAvatar' => true,
                'excludeConnectUsers' => true,
            ],
        ]);
        $users = is_array($response['users'] ?? null)
            ? $response['users']
            : [];
        $result = [];

        foreach ($users as $user) {
            $accountId = trim((string) ($user['accountId'] ?? ''));
            $displayName = trim((string) ($user['displayName'] ?? ''));

            if ('' === $accountId || '' === $displayName) {
                continue;
            }

            $result[] = [
                'accountId' => $accountId,
                'displayName' => $displayName,
                'avatarUrl' => isset($user['avatarUrl'])
                    ? (string) $user['avatarUrl']
                    : null,
            ];
        }

        return $result;
    }
}
