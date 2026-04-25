export interface Timestamps {
  createdAt: string;
  updatedAt: string;
}

export interface SoftDeletable extends Timestamps {
  deletedAt?: string | null;
}

/**
 * Legacy alias kept for backwards compatibility with code that imported
 * `TranslatableText` during the bilingual era. The platform is now
 * monolingual; all "translatable" fields are plain strings on the wire and
 * in the DB.
 *
 * @deprecated Use `string` directly. This alias will be removed in a future
 * cleanup pass once all consumers stop importing it.
 */
export type TranslatableText = string;
