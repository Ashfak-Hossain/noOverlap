import type { ValidationError } from 'class-validator';
import { AppException, type FieldError } from './errors/app.exception';

/**
 * Flattens class-validator's error tree into a flat `{ field, message }[]`.
 *
 * class-validator nests errors for nested DTOs (an invalid `address.city` arrives as a child of
 * `address`), so we recurse and join the path with dots. The client then gets one flat list keyed
 * by dotted field path instead of a nested structure it would have to walk.
 */
function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  const out: FieldError[] = [];
  for (const err of errors) {
    const field = parent ? `${parent}.${err.property}` : err.property;
    if (err.constraints) {
      for (const message of Object.values(err.constraints))
        out.push({ field, message });
    }
    if (err.children?.length) out.push(...flatten(err.children, field));
  }
  return out;
}

/**
 * The global {@link ValidationPipe}'s `exceptionFactory`. Converting the pipe's failure into an
 * {@link AppException} is the point: validation errors then flow through the *same*
 * {@link ProblemDetailsFilter} as domain errors, so a bad DTO and a business error come back in one
 * identical RFC 7807 shape rather than Nest's default 400 body.
 */
export function buildValidationException(
  errors: ValidationError[],
): AppException {
  return new AppException(
    'VALIDATION_FAILED',
    'One or more fields are invalid.',
    flatten(errors),
  );
}
