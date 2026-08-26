<?php

declare(strict_types=1);

namespace App\Validator;

use function is_string;

use LogicException;
use Symfony\Component\Validator\Constraint;
use Symfony\Component\Validator\ConstraintValidator;

final class JiraDurationValidator extends ConstraintValidator
{
    public function validate(mixed $value, Constraint $constraint): void
    {
        if (!$constraint instanceof JiraDuration) {
            throw new LogicException('Unexpected constraint type.');
        }

        if (null === $value || (is_string($value) && preg_match('/^(?:\d+\s*[wdhm]\s*)+$/i', $value))) {
            return;
        }

        $this->context->buildViolation($constraint->message)->addViolation();
    }
}
