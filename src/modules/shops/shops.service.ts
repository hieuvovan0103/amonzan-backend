import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class ShopsService {
    constructor(private readonly supabase: SupabaseService) { }

    async getPublicShopProfile(shopId: string) {
        const client = this.supabase.client;

        const { data: shop, error: shopError } = await client
            .from('shop_profiles')
            .select(
                `
                shop_id,
                shop_name,
                description,
                contact_phone,
                contact_email,
                partner_type,
                province,
                district,
                address_detail,
                rating_average,
                is_active,
                verification_status
                `,
            )
            .eq('shop_id', shopId)
            .eq('is_active', true)
            .single();

        if (shopError || !shop) {
            throw new NotFoundException('Không tìm thấy cửa hàng.');
        }

        const { data: products, count: productCount, error: productsError } =
            await client
                .from('products')
                .select(
                    `
                    product_id,
                    name,
                    slug,
                    average_rating,
                    categories (
                        name
                    ),
                    product_images (
                        image_url,
                        sort_order,
                        is_primary
                    ),
                    product_variants (
                        base_daily_rate,
                        available_stock
                    )
                    `,
                    { count: 'exact' },
                )
                .eq('shop_id', shopId)
                .eq('status', 'ACTIVE')
                .order('name', { ascending: true });

        if (productsError) {
            throw productsError;
        }

        const { data: reviews } = await client
            .from('reviews')
            .select(
                `
                review_id,
                rating,
                comment,
                created_at
                `,
            )
            .eq('target_type', 'SHOP')
            .eq('target_id', shopId)
            .order('created_at', { ascending: false });

        const mappedProducts = (products ?? []).map((product: any) => {
            const images = product.product_images ?? [];
            const variants = product.product_variants ?? [];
            const primaryImage =
                images.find((image: any) => image.is_primary) ??
                [...images].sort((a: any, b: any) => a.sort_order - b.sort_order)[0];
            const availableVariants = variants.filter(
                (variant: any) => Number(variant.available_stock) > 0,
            );
            const minDailyRate = availableVariants.length
                ? Math.min(
                    ...availableVariants.map((variant: any) =>
                        Number(variant.base_daily_rate),
                    ),
                )
                : 0;
            const availableStock = availableVariants.reduce(
                (total: number, variant: any) =>
                    total + Number(variant.available_stock ?? 0),
                0,
            );

            const category = Array.isArray(product.categories)
                ? product.categories[0]
                : product.categories;

            return {
                product_id: product.product_id,
                name: product.name,
                slug: product.slug,
                average_rating: product.average_rating,
                category_name: category?.name ?? null,
                primary_image_url: primaryImage?.image_url ?? null,
                min_daily_rate: minDailyRate,
                available_stock: availableStock,
            };
        });

        return {
            shop,
            products: mappedProducts,
            productCount: productCount ?? mappedProducts.length,
            reviews: reviews ?? [],
        };
    }

    async getShopByAuthUserId(authUserId: string) {
        const client = this.supabase.client;

        const { data: userProfile, error: userError } = await client
            .from('user_profiles')
            .select('user_id, auth_user_id, primary_role')
            .eq('auth_user_id', authUserId)
            .single();

        if (userError || !userProfile) {
            throw new NotFoundException('Không tìm thấy hồ sơ người dùng.');
        }

        const { data: shop, error: shopError } = await client
            .from('shop_profiles')
            .select('*')
            .eq('user_id', userProfile.user_id)
            .single();

        if (shopError || !shop) {
            throw new ForbiddenException('Tài khoản này chưa có hồ sơ cửa hàng.');
        }

        return shop;
    }

    async getActiveShopByAuthUserId(authUserId: string) {
        const shop = await this.getShopByAuthUserId(authUserId);

        if (!shop.is_active) {
            throw new ForbiddenException('Cửa hàng hiện đang bị tạm khóa.');
        }

        return shop;
    }

    async assertProductBelongsToShop(productId: string, shopId: string) {
        const client = this.supabase.client;

        const { data: product, error } = await client
            .from('products')
            .select('product_id, shop_id')
            .eq('product_id', productId)
            .single();

        if (error || !product) {
            throw new NotFoundException('Không tìm thấy sản phẩm.');
        }

        if (product.shop_id !== shopId) {
            throw new ForbiddenException(
                'Bạn không có quyền thao tác với sản phẩm này.',
            );
        }

        return product;
    }
}
