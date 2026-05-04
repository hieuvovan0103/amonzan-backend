import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { ProductQueryDto } from './dto/product-query.dto';
import {
    buildPaginationMeta,
    getPaginationRange,
} from './utils/pagination.util';
import {
    PublicProductCardResponse,
    PublicProductDetailResponse,
} from './types/product-response.type';

@Injectable()
export class ProductsService {
    constructor(private readonly supabase: SupabaseService) { }

    async findPublicProducts(query: ProductQueryDto) {
        const client = this.supabase.client;
        const { page, limit, from, to } = getPaginationRange(
            query.page,
            query.limit,
        );

        let request = client
            .from('products')
            .select(
                `
        product_id,
        shop_id,
        category_id,
        name,
        slug,
        description,
        status,
        average_rating,
        created_at,
        categories (
          category_id,
          name,
          slug
        ),
        shop_profiles!inner (
          shop_id,
          shop_name,
          rating_average,
          province,
          district,
          is_active
        ),
        product_images (
          image_id,
          image_url,
          sort_order,
          is_primary
        ),
        product_variants!inner (
          variant_id,
          variant_name,
          base_daily_rate,
          base_weekly_rate,
          deposit_requirement,
          condition,
          total_stock,
          available_stock
        )
      `,
                { count: 'exact' },
            )
            .eq('status', 'ACTIVE')
            .eq('shop_profiles.is_active', true)
            .gt('product_variants.available_stock', 0);

        if (query.keyword) {
            request = request.ilike('name', `%${query.keyword}%`);
        }

        if (query.categoryId) {
            request = request.eq('category_id', query.categoryId);
        }

        if (query.categorySlug) {
            request = request.eq('categories.slug', query.categorySlug);
        }

        if (query.province) {
            request = request.eq('shop_profiles.province', query.province);
        }

        if (query.condition) {
            request = request.eq('product_variants.condition', query.condition);
        }

        if (query.minPrice !== undefined) {
            request = request.gte('product_variants.base_daily_rate', query.minPrice);
        }

        if (query.maxPrice !== undefined) {
            request = request.lte('product_variants.base_daily_rate', query.maxPrice);
        }

        if (query.sort === 'rating_desc') {
            request = request.order('average_rating', { ascending: false });
        } else if (query.sort !== 'price_asc' && query.sort !== 'price_desc') {
            request = request.order('created_at', { ascending: false });
        }

        if (query.sort !== 'price_asc' && query.sort !== 'price_desc') {
            request = request.range(from, to);
        }

        const { data, count, error } = await request;

        if (error) {
            throw error;
        }

        const filteredData = this.applyVariantFilters(data ?? [], query);

        const mappedData = filteredData.map((product) =>
            this.mapProductCard(product),
        );

        if (query.sort === 'price_asc') {
            mappedData.sort((a, b) => a.min_daily_rate - b.min_daily_rate);
        }

        if (query.sort === 'price_desc') {
            mappedData.sort((a, b) => b.min_daily_rate - a.min_daily_rate);
        }

        const pagedData =
            query.sort === 'price_asc' || query.sort === 'price_desc'
                ? mappedData.slice(from, to + 1)
                : mappedData;

        return {
            data: pagedData,
            pagination: buildPaginationMeta({
                page,
                limit,
                total: count ?? mappedData.length,
            }),
        };
    }

    async findPublicProductDetail(slug: string) {
        const client = this.supabase.client;

        const { data, error } = await client
            .from('products')
            .select(
                `
        product_id,
        shop_id,
        category_id,
        name,
        slug,
        description,
        status,
        average_rating,
        created_at,
        updated_at,
        categories (
          category_id,
          name,
          slug,
          description
        ),
        shop_profiles!inner (
          shop_id,
          shop_name,
          description,
          rating_average,
          province,
          district,
          contact_phone,
          contact_email
        ),
        product_images (
          image_id,
          image_url,
          sort_order,
          is_primary
        ),
        product_variants (
          variant_id,
          sku,
          variant_name,
          base_daily_rate,
          base_weekly_rate,
          deposit_requirement,
          condition,
          total_stock,
          available_stock
        )
      `,
            )
            .eq('slug', slug)
            .eq('status', 'ACTIVE')
            .eq('shop_profiles.is_active', true)
            .single();

        if (error || !data) {
            throw new NotFoundException('Không tìm thấy sản phẩm.');
        }

        return data;
    }

    private applyVariantFilters(products: any[], query: ProductQueryDto) {
        return products.filter((product) => {
            const variants = product.product_variants ?? [];

            const availableVariants = variants.filter(
                (variant) => Number(variant.available_stock) > 0,
            );

            if (availableVariants.length === 0) {
                return false;
            }

            if (query.condition) {
                const hasCondition = availableVariants.some(
                    (variant) => variant.condition === query.condition,
                );

                if (!hasCondition) return false;
            }

            if (query.minPrice !== undefined) {
                const hasMinPrice = availableVariants.some(
                    (variant) => Number(variant.base_daily_rate) >= Number(query.minPrice),
                );

                if (!hasMinPrice) return false;
            }

            if (query.maxPrice !== undefined) {
                const hasMaxPrice = availableVariants.some(
                    (variant) => Number(variant.base_daily_rate) <= Number(query.maxPrice),
                );

                if (!hasMaxPrice) return false;
            }

            return true;
        });
    }

    private mapProductCard(product: any) {
        const images = product.product_images ?? [];
        const variants = product.product_variants ?? [];

        const primaryImage =
            images.find((image) => image.is_primary) ??
            images.sort((a, b) => a.sort_order - b.sort_order)[0];

        const availableVariants = variants.filter(
            (variant) => Number(variant.available_stock) > 0,
        );

        const minDailyRate =
            availableVariants.length > 0
                ? Math.min(
                    ...availableVariants.map((variant) =>
                        Number(variant.base_daily_rate),
                    ),
                )
                : 0;

        const availableStock = availableVariants.reduce(
            (total, variant) => total + Number(variant.available_stock),
            0,
        );

        return {
            product_id: product.product_id,
            name: product.name,
            slug: product.slug,
            description: product.description,
            average_rating: product.average_rating,
            category: product.categories,
            shop: product.shop_profiles,
            primary_image_url: primaryImage?.image_url ?? null,
            min_daily_rate: minDailyRate,
            available_stock: availableStock,
            created_at: product.created_at,
        };
    }
}
