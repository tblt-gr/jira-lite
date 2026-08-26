<?php

declare(strict_types=1);

namespace App\Tests\Validator;

use App\Validator\JiraDuration;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Validator\Validation;

final class JiraDurationValidatorTest extends TestCase
{
    /** @dataProvider validDurations */
    public function testItAcceptsJiraDurations(string $value): void
    {
        self::assertCount(0, $this->validate($value));
    }

    /** @dataProvider invalidDurations */
    public function testItRejectsInvalidDurations(string $value): void
    {
        self::assertCount(1, $this->validate($value));
    }

    /** @return iterable<string, array{string}> */
    public static function validDurations(): iterable
    {
        yield 'hours' => ['4h'];
        yield 'multiple units' => ['1w 2d'];
        yield 'uppercase' => ['3H'];
    }

    /** @return iterable<string, array{string}> */
    public static function invalidDurations(): iterable
    {
        yield 'empty' => [''];
        yield 'text' => ['abc'];
        yield 'unknown unit' => ['1x'];
    }

    private function validate(string $value): mixed
    {
        return Validation::createValidator()->validate($value, new JiraDuration());
    }
}
