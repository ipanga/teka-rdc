import { SellerDocumentType } from '@prisma/client';

/**
 * Which official documents a seller must have on file before the seller
 * can be reviewed for the « Vérifié » badge (decision D3). Kept in code —
 * not in the schema — so the rule can evolve (new types, per-city rules)
 * without a database redesign. `businessType` is the applicant-declared
 * 'individual' | 'company' already stored on SellerProfile.
 *
 * - company    → RCCM + Identification Nationale + identity document of the
 *                responsible person
 * - individual → one official identity document (+ the profile information
 *                already required by the application)
 * RCCM is never required of every seller. OTHER is always optional.
 */
export const REQUIRED_DOCUMENT_TYPES: Record<string, readonly SellerDocumentType[]> = {
  company: [
    SellerDocumentType.RCCM,
    SellerDocumentType.IDENTIFICATION_NATIONALE,
    SellerDocumentType.IDENTITY_DOCUMENT,
  ],
  individual: [SellerDocumentType.IDENTITY_DOCUMENT],
};

export function requiredDocumentTypes(businessType: string | null | undefined): readonly SellerDocumentType[] {
  return REQUIRED_DOCUMENT_TYPES[businessType ?? ''] ?? REQUIRED_DOCUMENT_TYPES.individual;
}

/** Types still missing given the seller's live (PENDING or ACCEPTED) documents. */
export function missingDocumentTypes(
  businessType: string | null | undefined,
  liveTypes: Iterable<SellerDocumentType>,
): SellerDocumentType[] {
  const have = new Set(liveTypes);
  return requiredDocumentTypes(businessType).filter((t) => !have.has(t));
}

/** Documents whose replacement is "material" (D5): every required type. */
export function isMaterialType(businessType: string | null | undefined, type: SellerDocumentType): boolean {
  return requiredDocumentTypes(businessType).includes(type);
}
