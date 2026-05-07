import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AdminProductReviewService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private get supabase() {
    return this.supabaseService.client;
  }

  private extractRoleNames(userRoles: any[] | null | undefined) {
    return (
      userRoles
        ?.map((userRole: any) => {
          if (Array.isArray(userRole.roles)) {
            return userRole.roles[0]?.role_name;
          }
          return userRole.roles?.role_name;
        })
        .filter(Boolean) ?? []
    );
  }

  private async ensureAdmin(authUserId: string) {
    const { data: profile, error } = await this.supabase
      .from('user_profiles')
      .select(
        `
        user_id,
        auth_user_id,
        user_roles (
          roles (
            role_name
          )
        )
      `,
      )
      .eq('auth_user_id', authUserId)
      .single();

    if (error || !profile) {
      throw new NotFoundException('Không tìm thấy hồ sơ người dùng.');
    }

    if (!this.extractRoleNames(profile.user_roles).includes('ADMIN')) {
      throw new ForbiddenException('Chỉ admin mới được kiểm duyệt sản phẩm.');
    }

    return profile;
  }

  private readonly PRODUCT_REVIEW_SELECT = `
    product_id,
    shop_id,
    category_id,
    name,
    slug,
    description,
    status,
    rejection_reason,
    reviewed_at,
    created_at,
    updated_at,
    categories (
      category_id,
      name,
      slug
    ),
    shop_profiles (
      shop_id,
      shop_name,
      contact_email,
      contact_phone,
      province,
      district
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
  `;

  async listPending(authUserId: string) {
    await this.ensureAdmin(authUserId);

    const { data, error } = await this.supabase
      .from('products')
      .select(this.PRODUCT_REVIEW_SELECT)
      .eq('status', 'PENDING_REVIEW')
      .order('updated_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(
        `Không thể tải danh sách sản phẩm chờ duyệt: ${error.message}`,
      );
    }

    return data ?? [];
  }

  async getDetail(authUserId: string, productId: string) {
    await this.ensureAdmin(authUserId);

    const { data, error } = await this.supabase
      .from('products')
      .select(this.PRODUCT_REVIEW_SELECT)
      .eq('product_id', productId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Không tìm thấy sản phẩm cần kiểm duyệt.');
    }

    return data;
  }

  async approve(authUserId: string, productId: string) {
    const adminProfile = await this.ensureAdmin(authUserId);
    await this.ensureReviewableProduct(productId);

    return this.updateReviewStatus(productId, {
      status: 'APPROVED',
      rejection_reason: null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminProfile.user_id,
    });
  }

  async reject(authUserId: string, productId: string, reason: string) {
    const adminProfile = await this.ensureAdmin(authUserId);
    const trimmedReason = reason.trim();

    if (trimmedReason.length < 5) {
      throw new BadRequestException('Vui lòng nhập lý do từ chối rõ ràng.');
    }

    await this.ensureReviewableProduct(productId);

    return this.updateReviewStatus(productId, {
      status: 'REJECTED',
      rejection_reason: trimmedReason,
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminProfile.user_id,
    });
  }

  private async ensureReviewableProduct(productId: string) {
    const { data, error } = await this.supabase
      .from('products')
      .select('product_id, status')
      .eq('product_id', productId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Không tìm thấy sản phẩm cần kiểm duyệt.');
    }

    if (data.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('Chỉ sản phẩm đang chờ duyệt mới có thể kiểm duyệt.');
    }

    return data;
  }

  private async updateReviewStatus(productId: string, updates: Record<string, any>) {
    const { data, error } = await this.supabase
      .from('products')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('product_id', productId)
      .select(this.PRODUCT_REVIEW_SELECT)
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        `Không thể cập nhật trạng thái kiểm duyệt: ${error?.message ?? 'Unknown error'}`,
      );
    }

    return data;
  }
}
