import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductAvailabilityQueryDto } from './dto/product-availability-query.dto';
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

    private readonly minSearchTokenLength = 2;

    private readonly bookedOrderStatuses = [
        'PENDING_VENDOR_APPROVAL',
        'CONFIRMED',
        'READY_FOR_PICKUP',
        'IN_RENTAL',
        'RETURN_PENDING',
        'LATE',
        'DISPUTED',
    ];

    async findPublicProducts(query: ProductQueryDto) {
        const client = this.supabase.client;
        const { page, limit, from, to } = getPaginationRange(
            query.page,
            query.limit,
        );

        const categorySlug = query.categorySlug ?? query.category;
        const search = this.normalizeSearchQuery(query.search ?? query.keyword);

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
        categories!inner (
          category_id,
          name,
          slug,
          is_active
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
            .eq('status', 'APPROVED')
            .eq('categories.is_active', true)
            .eq('shop_profiles.is_active', true)
            .gt('product_variants.available_stock', 0);

        if (query.categoryId) {
            request = request.eq('category_id', query.categoryId);
        }

        if (categorySlug) {
            request = request.eq('categories.slug', categorySlug);
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

        if (!search && query.sort !== 'price_asc' && query.sort !== 'price_desc') {
            request = request.range(from, to);
        }

        const { data, count, error } = await request;

        if (error) {
            throw error;
        }

        const filteredData = this.applyVariantFilters(data ?? [], query);

        const mappedData = filteredData
            .map((product) => this.mapProductCard(product))
            .filter((product) => !search || this.getSearchScore(product, search) > 0);

        if (search) {
            mappedData.sort((a, b) => {
                const scoreDiff =
                    this.getSearchScore(b, search) - this.getSearchScore(a, search);

                if (scoreDiff !== 0) return scoreDiff;

                const ratingDiff =
                    Number(b.average_rating ?? 0) - Number(a.average_rating ?? 0);

                if (ratingDiff !== 0) return ratingDiff;

                return (
                    new Date(b.created_at).getTime() -
                    new Date(a.created_at).getTime()
                );
            });
        } else if (query.sort === 'price_asc') {
            mappedData.sort((a, b) => a.min_daily_rate - b.min_daily_rate);
        }

        if (!search && query.sort === 'price_desc') {
            mappedData.sort((a, b) => b.min_daily_rate - a.min_daily_rate);
        }

        const pagedData =
            search || query.sort === 'price_asc' || query.sort === 'price_desc'
                ? mappedData.slice(from, to + 1)
                : mappedData;

        return {
            data: pagedData,
            pagination: buildPaginationMeta({
                page,
                limit,
                total: search ? mappedData.length : count ?? mappedData.length,
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
        categories!inner (
          category_id,
          name,
          slug,
          description,
          is_active
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
            .eq('status', 'APPROVED')
            .eq('categories.is_active', true)
            .eq('shop_profiles.is_active', true)
            .single();

        if (error || !data) {
            throw new NotFoundException('Không tìm thấy sản phẩm.');
        }

        const { data: reviews } = await client
            .from('reviews')
            .select(
                `
        review_id,
        rating,
        comment,
        created_at,
        is_hidden,
        renter_profiles (
          user_profiles (
            full_name,
            avatar_url
          )
        )
      `,
            )
            .eq('target_type', 'PRODUCT')
            .eq('target_id', data.product_id)
            .eq('is_hidden', false)
            .order('created_at', { ascending: false });

        return {
            ...data,
            reviews: (reviews ?? []).map((review: any) => {
                const userProfile = Array.isArray(review.renter_profiles?.user_profiles)
                    ? review.renter_profiles.user_profiles[0]
                    : review.renter_profiles?.user_profiles;

                return {
                    review_id: review.review_id,
                    rating: review.rating,
                    comment: review.comment,
                    created_at: review.created_at,
                    reviewer_name: userProfile?.full_name || 'Người thuê Amonzan',
                    reviewer_avatar_url: userProfile?.avatar_url ?? null,
                };
            }),
        };
    }

    async checkAvailability(slug: string, query: ProductAvailabilityQueryDto) {
        const product = await this.findActiveProductVariant(slug, query.variantId);
        const effectiveStock = Math.min(
            Number(product.variant.total_stock ?? 0),
            Number(product.variant.available_stock ?? 0),
        );

        return this.getVariantAvailability({
            variantId: query.variantId,
            totalStock: effectiveStock,
            start: query.start,
            end: query.end,
        });
    }

    private async findActiveProductVariant(slug: string, variantId: string) {
        const client = this.supabase.client;

        const { data, error } = await client
            .from('products')
            .select(
                `
        product_id,
        slug,
        status,
        shop_profiles!inner (
          is_active
        ),
        product_variants!inner (
          variant_id,
          total_stock,
          available_stock
        )
      `,
            )
            .eq('slug', slug)
            .eq('status', 'APPROVED')
            .eq('shop_profiles.is_active', true)
            .eq('product_variants.variant_id', variantId)
            .single();

        if (error || !data) {
            throw new NotFoundException('Không tìm thấy biến thể sản phẩm.');
        }

        const variant = Array.isArray(data.product_variants)
            ? data.product_variants[0]
            : data.product_variants;

        if (!variant) {
            throw new NotFoundException('Không tìm thấy biến thể sản phẩm.');
        }

        return { product: data, variant };
    }

    private async getVariantAvailability({
        variantId,
        totalStock,
        start,
        end,
    }: {
        variantId: string;
        totalStock: number;
        start: string;
        end: string;
    }) {
        const rentalStart = this.normalizeDate(start);
        const rentalEnd = this.normalizeDate(end);

        if (!rentalStart || !rentalEnd) {
            throw new BadRequestException('Ngày thuê không hợp lệ.');
        }

        if (rentalEnd <= rentalStart) {
            throw new BadRequestException('Ngày trả phải sau ngày thuê.');
        }

        const today = this.normalizeDate(new Date().toISOString());
        if (today && rentalStart < today) {
            throw new BadRequestException('Ngày thuê không được ở trong quá khứ.');
        }

        const isBlocked = await this.hasBlockedPeriod(variantId, rentalStart, rentalEnd);
        if (isBlocked) {
            return {
                available: false,
                availableStock: 0,
                bookedQuantity: totalStock,
                blocked: true,
                message: 'Sản phẩm đã bị khóa lịch trong thời gian này.',
            };
        }

        const bookedQuantity = await this.getBookedQuantity(variantId, rentalStart, rentalEnd);
        const availableStock = Math.max(0, totalStock - bookedQuantity);

        return {
            available: availableStock > 0,
            availableStock,
            bookedQuantity,
            blocked: false,
            message:
                availableStock > 0
                    ? null
                    : 'Sản phẩm đã kín lịch trong thời gian này.',
        };
    }

    private normalizeDate(value: string) {
        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return null;
        }

        return date.toISOString().slice(0, 10);
    }

    private async hasBlockedPeriod(variantId: string, start: string, end: string) {
        const client = this.supabase.client;

        const { data: calendar } = await client
            .from('availability_calendars')
            .select('calendar_id')
            .eq('variant_id', variantId)
            .maybeSingle();

        if (!calendar) {
            return false;
        }

        const { data, error } = await client
            .from('calendar_blocked_periods')
            .select('id')
            .eq('calendar_id', calendar.calendar_id)
            .lt('start_date', end)
            .gt('end_date', start)
            .limit(1);

        if (error) {
            throw error;
        }

        return Boolean(data?.length);
    }

    private async getBookedQuantity(variantId: string, start: string, end: string) {
        const client = this.supabase.client;

        const { data, error } = await client
            .from('rental_order_items')
            .select(
                `
        quantity,
        rental_orders!inner (
          status,
          rental_start,
          rental_end
        )
      `,
            )
            .eq('variant_id', variantId)
            .in('rental_orders.status', this.bookedOrderStatuses)
            .lt('rental_orders.rental_start', end)
            .gt('rental_orders.rental_end', start);

        if (error) {
            throw error;
        }

        return (data ?? []).reduce(
            (sum, item) => sum + Number(item.quantity ?? 0),
            0,
        );
    }

    private applyVariantFilters(products: any[], query: ProductQueryDto) {
        return products.filter((product) => {
            const variants = product.product_variants ?? [];

            const availableVariants = variants.filter(
                (variant) => Number(variant.available_stock ?? 0) > 0,
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

    private normalizeSearchQuery(value?: string | null) {
        const phrase = value?.trim().toLowerCase().replace(/\s+/g, ' ');

        if (!phrase) return null;

        const tokens = Array.from(
            new Set(
                phrase
                    .split(' ')
                    .map((token) => token.trim())
                    .filter((token) => token.length >= this.minSearchTokenLength),
            ),
        );

        if (phrase.length < this.minSearchTokenLength && tokens.length === 0) {
            return null;
        }

        return { phrase, tokens };
    }

    private getSearchScore(
        product: ReturnType<ProductsService['mapProductCard']>,
        search: { phrase: string; tokens: string[] },
    ) {
        const name = this.normalizeSearchableText(product.name);
        const description = this.normalizeSearchableText(product.description);
        const category = this.normalizeSearchableText(product.category?.name);
        const shopName = this.normalizeSearchableText(product.shop?.shop_name);
        const variantNames = this.normalizeSearchableText(
            product.variant_names?.join(' '),
        );

        let score = 0;

        if (name.includes(search.phrase)) score += 100;
        if (description.includes(search.phrase)) score += 35;
        if (category.includes(search.phrase)) score += 45;
        if (shopName.includes(search.phrase)) score += 25;
        if (variantNames.includes(search.phrase)) score += 40;

        search.tokens.forEach((token) => {
            if (name.includes(token)) score += 50;
            if (category.includes(token)) score += 30;
            if (variantNames.includes(token)) score += 25;
            if (description.includes(token)) score += 20;
            if (shopName.includes(token)) score += 10;
        });

        return score + Number(product.average_rating ?? 0);
    }

    private normalizeSearchableText(value?: string | null) {
        return value?.toLowerCase().replace(/\s+/g, ' ').trim() ?? '';
    }

    private mapProductCard(product: any) {
        const images = product.product_images ?? [];
        const variants = product.product_variants ?? [];

        const primaryImage =
            images.find((image) => image.is_primary) ??
            images.sort((a, b) => a.sort_order - b.sort_order)[0];

        const availableVariants = variants.filter(
            (variant) => Number(variant.available_stock ?? 0) > 0,
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
            (total, variant) => total + Number(variant.available_stock ?? 0),
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
            variant_names: variants.map((variant) => variant.variant_name).filter(Boolean),
            primary_image_url: primaryImage?.image_url ?? null,
            min_daily_rate: minDailyRate,
            available_stock: availableStock,
            created_at: product.created_at,
        };
    }
}
