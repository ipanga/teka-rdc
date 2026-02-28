export interface Timestamps {
  createdAt: string;
  updatedAt: string;
}

export interface SoftDeletable extends Timestamps {
  deletedAt?: string | null;
}

export interface TranslatableText {
  fr: string;
  en?: string;
}
