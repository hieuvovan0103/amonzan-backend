import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CategoriesService } from '../modules/categories/categories.service';
import { CreateVendorProductDto } from './dto/create-vendor-product.dto';
import { UpdateVendorProductDto } from './dto/update-vendor-product.dto';

@Injectable()
export class VendorProductsService {
    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly categoriesService: CategoriesService,
    ) { }

    private get supabase() {
        return this.supabaseService.client;
    }

    private async getUserProfileByAuthId(authUserId: string) {
        const { data, error } = await this.supabase
            .from('user_profiles')
            .select('*')
            .eq('auth_user_id', authUserId)
            .single();

        if (error || !data) {
            throw new NotFoundException('Không tìm thấy hồ sơ người dùng');
        }

        return data;
    }

    private async getShopByUserId(userId: string) {
        const { data, error } = await this.supabase
            .from('shop_profiles')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error || !data) {
            throw new NotFoundException('Bạn chưa có gian hàng');
        }

        if (!data.is_active) {
            throw new BadRequestException('Gian hàng của bạn đang bị khóa');
        }

        return data;
    }

    private async getCurrentVendorShop(authUserId: string) {
        const profile = await this.getUserProfileByAuthId(authUserId);
        return this.getShopByUserId(profile.user_id);
    }

    async getMyProducts(authUserId: string) {
        const shop = await this.getCurrentVendorShop(authUserId);

        const { data, error } = await this.supabase
            .from('products')
            .select(`
        *,
        categories (
          category_id,
          name,
          slug
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
      `)
            .eq('shop_id', shop.shop_id)
            .order('created_at', { ascending: false });

        if (error) {
            throw new BadRequestException(error.message);
        }

        return data;
    }

    async getProductDetail(authUserId: string, productId: string) {
        const shop = await this.getCurrentVendorShop(authUserId);

        const { data, error } = await this.supabase
            .from('products')
            .select(`
        *,
        categories (
          category_id,
          name,
          slug
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
          available_stock,
          inventory_items (
            item_id,
            serial_number,
            qr_code,
            status,
            current_condition
          ),
          availability_calendars (
            calendar_id,
            calendar_blocked_periods (
              id,
              start_date,
              end_date,
              reason
            )
          )
        )
      `)
            .eq('product_id', productId)
            .eq('shop_id', shop.shop_id)
            .single();

        if (error || !data) {
            throw new NotFoundException('Không tìm thấy sản phẩm');
        }

        return data;
    }

    async createProduct(authUserId: string, dto: CreateVendorProductDto) {
        const shop = await this.getCurrentVendorShop(authUserId);
        await this.categoriesService.assertActiveCategory(dto.category_id);

        if (!dto.images?.length) {
            throw new BadRequestException('Vui lòng tải lên ít nhất một ảnh sản phẩm.');
        }

        const { data: product, error: productError } = await this.supabase
            .from('products')
            .insert({
                shop_id: shop.shop_id,
                category_id: dto.category_id,
                name: dto.name,
                slug: dto.slug,
                description: dto.description ?? null,
                status: 'DRAFT',
                rejection_reason: null,
            })
            .select('*')
            .single();

        if (productError || !product) {
            throw new BadRequestException(productError?.message || 'Tạo sản phẩm thất bại');
        }

        if (dto.images?.length) {
            const images = dto.images.map((image, index) => ({
                product_id: product.product_id,
                image_url: image.image_url,
                sort_order: image.sort_order ?? index,
                is_primary: image.is_primary ?? index === 0,
            }));

            const { error } = await this.supabase
                .from('product_images')
                .insert(images);

            if (error) {
                throw new BadRequestException(error.message);
            }
        }

        for (const variant of dto.variants) {
            const { data: createdVariant, error: variantError } = await this.supabase
                .from('product_variants')
                .insert({
                    product_id: product.product_id,
                    sku: variant.sku,
                    variant_name: variant.variant_name,
                    base_daily_rate: variant.base_daily_rate,
                    base_weekly_rate: variant.base_weekly_rate ?? null,
                    deposit_requirement: 0,
                    condition: variant.condition ?? 'NEW',
                    total_stock: variant.total_stock,
                    available_stock: variant.total_stock,
                })
                .select('*')
                .single();

            if (variantError || !createdVariant) {
                throw new BadRequestException(
                    variantError?.message || 'Tạo biến thể sản phẩm thất bại',
                );
            }

            const { error: calendarError } = await this.supabase
                .from('availability_calendars')
                .insert({
                    variant_id: createdVariant.variant_id,
                });

            if (calendarError) {
                throw new BadRequestException(calendarError.message);
            }

            if (variant.total_stock > 0) {
                const inventoryItems = Array.from({ length: variant.total_stock }).map(
                    (_, index) => ({
                        variant_id: createdVariant.variant_id,
                        serial_number: `${variant.sku}-${index + 1}`,
                        status: 'AVAILABLE',
                        current_condition: variant.condition ?? 'NEW',
                    }),
                );

                const { error: inventoryError } = await this.supabase
                    .from('inventory_items')
                    .insert(inventoryItems);

                if (inventoryError) {
                    throw new BadRequestException(inventoryError.message);
                }
            }
        }

        return this.getProductDetail(authUserId, product.product_id);
    }

    async updateProduct(
        authUserId: string,
        productId: string,
        dto: UpdateVendorProductDto,
    ) {
        const shop = await this.getCurrentVendorShop(authUserId);
        await this.ensureProductCanBeEdited(productId, shop.shop_id);

        if (dto.category_id !== undefined) {
            await this.categoriesService.assertActiveCategory(dto.category_id);
        }

        const updates = Object.fromEntries(
            Object.entries(dto).filter(([, value]) => value !== undefined),
        );

        const { data, error } = await this.supabase
            .from('products')
            .update({
                ...updates,
                updated_at: new Date().toISOString(),
            })
            .eq('product_id', productId)
            .eq('shop_id', shop.shop_id)
            .select('*')
            .single();

        if (error || !data) {
            throw new BadRequestException(error?.message || 'Cập nhật sản phẩm thất bại');
        }

        return data;
    }

    async updateProductStatus(
        authUserId: string,
        productId: string,
        status: 'DRAFT' | 'ARCHIVED',
    ) {
        const shop = await this.getCurrentVendorShop(authUserId);
        const { data: product, error: fetchError } = await this.supabase
            .from('products')
            .select('product_id, status')
            .eq('product_id', productId)
            .eq('shop_id', shop.shop_id)
            .single();

        if (fetchError || !product) {
            throw new NotFoundException('Không tìm thấy sản phẩm');
        }

        if (product.status === 'PENDING_REVIEW') {
            throw new BadRequestException('Sản phẩm đang chờ duyệt nên không thể đổi trạng thái.');
        }

        const { data, error } = await this.supabase
            .from('products')
            .update({
                status,
                updated_at: new Date().toISOString(),
            })
            .eq('product_id', productId)
            .eq('shop_id', shop.shop_id)
            .select('*')
            .single();

        if (error || !data) {
            throw new BadRequestException(error?.message || 'Cập nhật trạng thái sản phẩm thất bại');
        }

        return this.getProductDetail(authUserId, productId);
    }

    async submitProductForReview(authUserId: string, productId: string) {
        const shop = await this.getCurrentVendorShop(authUserId);

        const { data: product, error: fetchError } = await this.supabase
            .from('products')
            .select('product_id, status')
            .eq('product_id', productId)
            .eq('shop_id', shop.shop_id)
            .single();

        if (fetchError || !product) {
            throw new NotFoundException('Không tìm thấy sản phẩm');
        }

        if (!['DRAFT', 'REJECTED'].includes(product.status)) {
            throw new BadRequestException('Chỉ sản phẩm bản nháp hoặc bị từ chối mới có thể gửi duyệt.');
        }

        const { error } = await this.supabase
            .from('products')
            .update({
                status: 'PENDING_REVIEW',
                rejection_reason: null,
                updated_at: new Date().toISOString(),
            })
            .eq('product_id', productId)
            .eq('shop_id', shop.shop_id);

        if (error) {
            throw new BadRequestException(error.message || 'Gửi duyệt sản phẩm thất bại');
        }

        return this.getProductDetail(authUserId, productId);
    }

    private async ensureProductCanBeEdited(productId: string, shopId: string) {
        const { data: product, error } = await this.supabase
            .from('products')
            .select('product_id, status')
            .eq('product_id', productId)
            .eq('shop_id', shopId)
            .single();

        if (error || !product) {
            throw new NotFoundException('Không tìm thấy sản phẩm');
        }

        if (product.status === 'PENDING_REVIEW') {
            throw new BadRequestException('Sản phẩm đang chờ duyệt nên không thể chỉnh sửa.');
        }

        if (product.status === 'APPROVED') {
            throw new BadRequestException('Sản phẩm đã được duyệt. Hãy chuyển về bản nháp trước khi chỉnh sửa.');
        }

        return product;
    }
}
