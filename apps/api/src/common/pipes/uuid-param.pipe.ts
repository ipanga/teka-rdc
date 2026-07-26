import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

/**
 * `ParseUUIDPipe` with a French message.
 *
 * Nest's built-in pipe throws `BadRequestException('Validation failed (uuid is
 * expected)')`. That is a plain string, not the array class-validator produces,
 * so `HttpExceptionFilter` passes it straight through as `error.message` — and
 * the mobile error helper, which treats any 4xx message as an already-French
 * business message, rendered it verbatim to buyers (Rule 1). This surfaced as
 * "Validation failed (uuid is expected)" on the rating screen and in the
 * favorite snackbar when the client sent a shortCode instead of a uuid.
 *
 * Fixing the callers is the real fix; this is the backstop that keeps any
 * future mistake from leaking English to users.
 *
 * Usage: `@Param('productId', UuidParam) productId: string`
 */
export const UuidParam = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('Identifiant invalide.'),
});
