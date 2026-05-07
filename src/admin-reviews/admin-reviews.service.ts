import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ProductReviewsService } from '../product-reviews/product-reviews.service';

@Injectable()
export class AdminReviewsService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly productReviewsService: ProductReviewsService,
  ) {}

  private get supabase() {
    return this.supabaseService.client;
  }

  async list(authUserId: string) {
    await this.ensureAdmin(authUserId);

    const { data, error } = await this.supabase
      .from('reviews')
      .select(
        `
        review_id,
        renter_profile_id,
        order_id,
        target_type,
        target_id,
        reviewer_shop_id,
        rating,
        comment,
        created_at,
        is_hidden,
        hidden_at,
        reported_at,
        report_reason,
        report_status,
        renter_profiles (
          user_profiles (
            full_name,
            email
          )
        )
      `,
      )
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(
        `Không thể tải danh sách đánh giá: ${error.message}`,
      );
    }

    const productIds = [
      ...new Set(
        (data ?? [])
          .filter((review) => review.target_type === 'PRODUCT')
          .map((review) => review.target_id),
      ),
    ];
    const productsById = await this.getProductsById(productIds);
    const shopsById = await this.getShopsById(
      (data ?? [])
        .map((review) => review.reviewer_shop_id)
        .filter(Boolean),
    );

    return (data ?? []).map((review: any) => {
      const renterProfile = Array.isArray(review.renter_profiles)
        ? review.renter_profiles[0]
        : review.renter_profiles;
      const userProfile = Array.isArray(renterProfile?.user_profiles)
        ? renterProfile.user_profiles[0]
        : renterProfile?.user_profiles;
      const reviewerShopName = shopsById.get(review.reviewer_shop_id);

      return {
        review_id: review.review_id,
        order_id: review.order_id,
        target_type: review.target_type,
        target_id: review.target_id,
        rating: Number(review.rating ?? 0),
        comment: review.comment,
        created_at: review.created_at,
        is_hidden: Boolean(review.is_hidden),
        hidden_at: review.hidden_at,
        reported_at: review.reported_at,
        report_reason: review.report_reason,
        report_status: review.report_status,
        reviewer_name: reviewerShopName || userProfile?.full_name || 'Người thuê Amonzan',
        reviewer_email: userProfile?.email ?? null,
        product: productsById.get(review.target_id) ?? null,
      };
    });
  }

  async hide(authUserId: string, reviewId: string) {
    const adminProfile = await this.ensureAdmin(authUserId);
    const review = await this.getReview(reviewId);

    const { data, error } = await this.supabase
      .from('reviews')
      .update({
        is_hidden: true,
        hidden_at: new Date().toISOString(),
        hidden_by: adminProfile.user_id,
        updated_at: new Date().toISOString(),
      })
      .eq('review_id', reviewId)
      .select('review_id, target_type, target_id')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        `Không thể ẩn đánh giá: ${error?.message ?? 'Unknown error'}`,
      );
    }

    if (review.target_type === 'PRODUCT') {
      await this.productReviewsService.refreshProductRating(review.target_id);
    }

    return { success: true };
  }

  async remove(authUserId: string, reviewId: string) {
    await this.ensureAdmin(authUserId);
    const review = await this.getReview(reviewId);

    const { error } = await this.supabase
      .from('reviews')
      .delete()
      .eq('review_id', reviewId);

    if (error) {
      throw new InternalServerErrorException(
        `Không thể xóa đánh giá: ${error.message}`,
      );
    }

    if (review.target_type === 'PRODUCT') {
      await this.productReviewsService.refreshProductRating(review.target_id);
    }

    return { success: true };
  }

  private async getReview(reviewId: string) {
    const { data, error } = await this.supabase
      .from('reviews')
      .select('review_id, target_type, target_id')
      .eq('review_id', reviewId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Không tìm thấy đánh giá.');
    }

    return data;
  }

  private async getProductsById(productIds: string[]) {
    const map = new Map<string, any>();
    if (productIds.length === 0) {
      return map;
    }

    const { data } = await this.supabase
      .from('products')
      .select(
        `
        product_id,
        name,
        slug,
        shop_profiles (
          shop_name
        )
      `,
      )
      .in('product_id', productIds);

    (data ?? []).forEach((product) => {
      const shop = Array.isArray(product.shop_profiles)
        ? product.shop_profiles[0]
        : product.shop_profiles;

      map.set(product.product_id, {
        product_id: product.product_id,
        name: product.name,
        slug: product.slug,
        shop_name: shop?.shop_name ?? null,
      });
    });

    return map;
  }

  private async getShopsById(shopIds: string[]) {
    const map = new Map<string, string>();
    const uniqueShopIds = [...new Set(shopIds)];

    if (uniqueShopIds.length === 0) {
      return map;
    }

    const { data } = await this.supabase
      .from('shop_profiles')
      .select('shop_id, shop_name')
      .in('shop_id', uniqueShopIds);

    (data ?? []).forEach((shop) => {
      map.set(shop.shop_id, shop.shop_name);
    });

    return map;
  }

  private async ensureAdmin(authUserId: string) {
    const { data: profile, error } = await this.supabase
      .from('user_profiles')
      .select(
        `
        user_id,
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

    const roles =
      profile.user_roles
        ?.map((userRole: any) => {
          const role = Array.isArray(userRole.roles) ? userRole.roles[0] : userRole.roles;
          return role?.role_name;
        })
        .filter(Boolean) ?? [];

    if (!roles.includes('ADMIN')) {
      throw new ForbiddenException('Chỉ admin mới được quản lý đánh giá.');
    }

    return profile;
  }
}
