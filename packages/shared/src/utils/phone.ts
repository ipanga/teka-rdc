/**
 * Normalize a DRC phone number to the API's canonical form `+243XXXXXXXXX`.
 *
 * Accepted input shapes (any spaces, dots, dashes or parentheses are ignored):
 *
 *   9 digits                      990000001          → +243990000001
 *   10 digits, leading 0          0990000001         → +243990000001
 *   243 + 9 digits (with/without +)  +243990000001   → +243990000001
 *   00243 + 9 digits              00243990000001     → +243990000001
 *   anything else                                    → null (caller surfaces a
 *                                                      validation error)
 *
 * The 9 national digits must start with 8 or 9 (DRC mobile ranges) — so a
 * 9-digit value that is not a DRC mobile number, or a foreign number, is
 * rejected rather than turned into a plausible-looking +243 value.
 *
 * One rule for every surface (PR D2, 2026-09-07): the API applies it on write
 * for recipient phones (`CreateAddressDto`), buyer-web and buyer-mobile apply
 * it in their inputs, so equivalent inputs always store the same value and a
 * client can never bypass it by sending the raw text.
 *
 * Mirror: `apps/buyer-mobile/lib/core/utils/phone.dart`. Keep both in sync.
 */
export function normalizeDrcPhone(input: string): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // A '+' is only meaningful at the very start; any other letter/symbol makes
  // the value malformed rather than "digits with decoration".
  const body = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  if (!/^[0-9\s().-]+$/.test(body)) return null;
  const digits = body.replace(/\D/g, '');

  let national: string | null = null;
  if (digits.length === 9) national = digits;
  else if (digits.length === 10 && digits.startsWith('0')) national = digits.slice(1);
  else if (digits.length === 12 && digits.startsWith('243')) national = digits.slice(3);
  else if (digits.length === 14 && digits.startsWith('00243')) national = digits.slice(5);
  if (national === null) return null;

  if (!/^[89]\d{8}$/.test(national)) return null;
  return `+243${national}`;
}
