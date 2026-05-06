import { ProductStatus } from './product-status.type';

export type ProductCategoryResponse = {
    category_id: string;
    name: string;
    slug: string;
    description?: string | null;
};

export type ProductShopResponse = {
    shop_id: string;
    shop_name: string;
    description?: string | null;
    rating_average: number;
    province?: string | null;
    district?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
};

export type ProductImageResponse = {
    image_id: string;
    image_url: string;
    sort_order: number;
    is_primary: boolean;
};

export type ProductVariantResponse = {
    variant_id: string;
    sku?: string;
    variant_name: string;
    base_daily_rate: number;
    base_weekly_rate?: number | null;
    deposit_requirement: number;
    condition: string;
    total_stock: number;
    available_stock: number;
};

export type ProductReviewResponse = {
    review_id: string;
    rating: number;
    comment?: string | null;
    created_at: string;
    reviewer_name?: string | null;
    reviewer_avatar_url?: string | null;
};

export type PublicProductCardResponse = {
    product_id: string;
    name: string;
    slug: string;
    description?: string | null;
    average_rating: number;
    category?: ProductCategoryResponse | null;
    shop?: ProductShopResponse | null;
    primary_image_url?: string | null;
    min_daily_rate: number;
    available_stock: number;
    created_at: string;
};

export type PublicProductDetailResponse = {
    product_id: string;
    shop_id: string;
    category_id?: string | null;
    name: string;
    slug: string;
    description?: string | null;
    status: ProductStatus;
    average_rating: number;
    created_at: string;
    updated_at: string;
    categories?: ProductCategoryResponse | null;
    shop_profiles?: ProductShopResponse | null;
    product_images: ProductImageResponse[];
    product_variants: ProductVariantResponse[];
    reviews?: ProductReviewResponse[];
};

export type VendorProductCardResponse = {
    product_id: string;
    name: string;
    slug: string;
    description?: string | null;
    status: ProductStatus;
    average_rating: number;
    category?: ProductCategoryResponse | null;
    primary_image_url?: string | null;
    total_variants: number;
    total_stock: number;
    available_stock: number;
    min_daily_rate: number;
    created_at: string;
    updated_at: string;
};
