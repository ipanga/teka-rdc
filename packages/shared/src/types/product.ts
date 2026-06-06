import type { SoftDeletable } from './common';

// Enums
export type ProductCondition = 'NEW' | 'USED';
export type ProductStatus = 'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE' | 'REJECTED' | 'ARCHIVED';
export type AttributeType = 'TEXT' | 'SELECT' | 'MULTISELECT' | 'NUMERIC';

// Category
export interface Category extends SoftDeletable {
  id: string;
  name: string;
  description?: string | null;
  parentCategoryId?: string | null;
  emoji?: string | null;
  sortOrder: number;
  isActive: boolean;
  subcategories?: Category[];
  productCount?: number;
}

// Product
export interface Product extends SoftDeletable {
  id: string;
  // Cosmetic, city-independent slug; canonical URL is
  // `/{citySlug}/{slug}-{shortCode}`, resolved by `shortCode`.
  slug?: string | null;
  shortCode?: string | null;
  title: string;
  description: string;
  categoryId: string;
  sellerId: string;
  cityId?: string | null;
  priceCDF: string; // BigInt serialized as string
  priceUSD?: string | null;
  quantity: number;
  condition: ProductCondition;
  status: ProductStatus;
  rejectionReason?: string | null;
  images?: ProductImage[];
  specifications?: ProductSpecification[];
  category?: Category;
  seller?: ProductSeller;
}

export interface ProductSeller {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  sellerProfile?: { businessName: string } | null;
}

// Product Image
export interface ProductImage {
  id: string;
  productId: string;
  cloudinaryId: string;
  url: string;
  thumbnailUrl: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

// Product Attribute (per-category definition)
export interface ProductAttribute {
  id: string;
  categoryId: string;
  name: string;
  type: AttributeType;
  options?: string[] | null;
  isRequired: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// Product Specification (product's attribute value)
export interface ProductSpecification {
  id: string;
  productId: string;
  attributeId: string;
  value: string;
  attribute?: ProductAttribute;
  createdAt: string;
  updatedAt: string;
}

// Browse response shapes
export interface BrowseProduct {
  id: string;
  // Cosmetic, city-independent slug (city-first URL refactor). The canonical
  // product URL is `/{citySlug}/{slug}-{shortCode}`; products resolve by
  // `shortCode`. Both may be null on legacy rows pending backfill.
  slug?: string | null;
  shortCode?: string | null;
  title: string;
  priceCDF: string;
  priceUSD?: string | null;
  condition: ProductCondition;
  quantity: number;
  image?: ProductImage | null;
  seller: { businessName: string };
  categoryId: string;
  cityId?: string | null;
  // City of availability — included so mixed-city listings (e.g. the homepage)
  // can build each card's `/{citySlug}/…` URL without a second lookup.
  citySlug?: string | null;
  cityName?: string | null;
}

export interface CursorPagination {
  nextCursor?: string | null;
  hasMore: boolean;
  total: number;
}
