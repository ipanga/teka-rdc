/**
 * The platform-owned seller account ("Teka RDC Officiel", provisioned by the
 * seed). « Officiel » is a distinct concept from document verification: it
 * marks products sold by Teka itself, it is never inferred from the business
 * name on the client, and it does not imply or replace `verified`.
 */
export const PLATFORM_SELLER_USER_ID = '10000000-0000-0000-0000-000000999999';

export function isPlatformSeller(userId: string | null | undefined): boolean {
  return userId === PLATFORM_SELLER_USER_ID;
}
