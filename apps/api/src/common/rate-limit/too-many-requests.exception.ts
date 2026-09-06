import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 429 with a French, non-revealing message and a `Retry-After` (seconds) the
 * HttpExceptionFilter turns into the response header. The message never
 * states the threshold or whether the identifier exists.
 */
export class TooManyRequestsException extends HttpException {
  constructor(
    message: string,
    public readonly retryAfterSeconds: number,
  ) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

/** French copy for a wait of `seconds`, rounded up to whole minutes above 90 s. */
export function waitCopy(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s <= 90) return `Veuillez patienter ${s} s avant de réessayer.`;
  // Whole minutes, rounded (a 902 s lock reads « 15 min », not « 16 min »).
  const minutes = Math.max(2, Math.round(s / 60));
  return `Veuillez patienter ${minutes} min avant de réessayer.`;
}
