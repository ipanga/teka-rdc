/**
 * Normalize a DRC phone number from local UX format to API format.
 *
 * Accepts a string of digits with optional leading 0. Strips any non-digit
 * characters first — paste tolerance.
 *
 *   9 digits              → +243XXXXXXXXX  (already canonical local)
 *   10 digits, leading 0  → +243XXXXXXXXX  (strip the 0)
 *   anything else         → null            (caller surfaces a validation error)
 *
 * Country prefix +243 is added by the system; users never type it. Backend
 * DTOs continue to enforce /^\+243\d{9}$/, so this helper is purely about
 * making the input layer match what the backend expects.
 *
 * Mirror in `apps/buyer-mobile/lib/core/utils/phone.dart`. Keep both files
 * in sync when changing the rules.
 */
export function normalizeDrcPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 9) return `+243${digits}`;
  if (digits.length === 10 && digits.startsWith('0')) {
    return `+243${digits.slice(1)}`;
  }
  return null;
}
