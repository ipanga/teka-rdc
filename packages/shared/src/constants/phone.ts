export const DRC_COUNTRY_CODE = '+243';

/** Matches DRC phone numbers: +243 followed by 9 digits */
export const DRC_PHONE_REGEX = /^\+243\d{9}$/;

/** Formats a raw phone number to international format */
export function formatPhoneInternational(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('243') && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return `+243${cleaned.slice(1)}`;
  }
  if (cleaned.length === 9) {
    return `+243${cleaned}`;
  }
  return phone;
}
