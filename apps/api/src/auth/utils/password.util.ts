import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';

export async function hashPassword(
  plain: string,
  rounds: number,
): Promise<string> {
  return bcrypt.hash(plain, rounds);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export function generateResetToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function hashResetToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
