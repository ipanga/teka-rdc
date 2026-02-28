export const PRODUCT_CONDITIONS = ['NEW', 'USED'] as const;
export const PRODUCT_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'ARCHIVED'] as const;
export const ATTRIBUTE_TYPES = ['TEXT', 'SELECT', 'MULTISELECT', 'NUMERIC'] as const;
export const MAX_PRODUCT_IMAGES = 8;
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const BROWSE_DEFAULT_LIMIT = 20;
export const BROWSE_MAX_LIMIT = 100;
