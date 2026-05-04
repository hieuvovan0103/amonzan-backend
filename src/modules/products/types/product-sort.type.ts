export type ProductSort =
    | 'newest'
    | 'price_asc'
    | 'price_desc'
    | 'rating_desc';

export const PRODUCT_SORT_OPTIONS = {
    NEWEST: 'newest',
    PRICE_ASC: 'price_asc',
    PRICE_DESC: 'price_desc',
    RATING_DESC: 'rating_desc',
} as const;