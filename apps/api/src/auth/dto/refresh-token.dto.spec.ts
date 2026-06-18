import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RefreshTokenDto } from './refresh-token.dto';

/**
 * Regression guard for the 2026-06-18 hotfix: the web clients refresh via the
 * HttpOnly cookie and POST an empty `{}` body. If `refreshToken` is marked
 * required, the global ValidationPipe 400s every cookie-based refresh BEFORE
 * the controller's cookie-fallback runs → users get logged out the moment
 * their 15-min access token expires mid-session. It MUST stay optional.
 */
describe('RefreshTokenDto', () => {
  const validate = (obj: unknown) =>
    validateSync(plainToInstance(RefreshTokenDto, obj));

  it('accepts an empty body (web cookie-based refresh)', () => {
    expect(validate({})).toHaveLength(0);
  });

  it('accepts a present non-empty token (mobile body-based refresh)', () => {
    expect(validate({ refreshToken: 'a.valid.jwt' })).toHaveLength(0);
  });

  it('still rejects an explicit empty-string token', () => {
    const errors = validate({ refreshToken: '' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('still rejects a non-string token', () => {
    const errors = validate({ refreshToken: 123 });
    expect(errors.length).toBeGreaterThan(0);
  });
});
