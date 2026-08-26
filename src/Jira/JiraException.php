<?php

declare(strict_types=1);

namespace App\Jira;

use RuntimeException;
use Throwable;

final class JiraException extends RuntimeException
{
    public function __construct(
        public readonly ?int $jiraStatus,
        Throwable $previous,
    ) {
        parent::__construct('The Jira API request failed.', 0, $previous);
    }
}
