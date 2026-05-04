export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export const PRODUCT_STATUS = {
    DRAFT: 'DRAFT',
    ACTIVE: 'ACTIVE',
    ARCHIVED: 'ARCHIVED',
} as const;
