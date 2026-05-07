import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateProductReviewDto } from './dto/create-product-review.dto';

const PRODUCT_TARGET_TYPE = 'PRODUCT';

type ProductReviewRow = {
  review_id: string;
  renter_profile_id: string;
  order_id: string | null;
  target_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at?: string;
  is_hidden?: boolean;
  renter_profiles?: any;
  review_replies?: any;
};

@Injectable()
export class ProductReviewsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private get supabase() {
    return this.supabaseService.client;
  }

  async listForProduct(productId: string) {
    await this.ensureApprovedProduct(productId);

    const { data, error } = await this.supabase
      .from('reviews')
      .select(
        `
        review_id,
        renter_profile_id,
        order_id,
        target_id,
        rating,
        comment,
        created_at,
        is_hidden,
        renter_profiles (
          renter_profile_id,
          user_profiles (
            full_name,
            avatar_url
          )
        ),
        review_replies (
          reply_id,
          review_id,
          shop_id,
          content,
          created_at,
          updated_at,
          shop_profiles (
            shop_name
          )
        )
      `,
      )
      .eq('target_type', PRODUCT_TARGET_TYPE)
      .eq('target_id', productId)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(
        `Không thể tải đánh giá sản phẩm: ${error.message}`,
      );
    }

    return {
      reviews: (data ?? []).map((review) => this.mapPublicReview(review)),
      summary: this.buildSummary(data ?? []),
    };
  }

  async getEligibility(authUserId: string | undefined, productId: string) {
    if (!authUserId) {
      throw new UnauthorizedException('Bạn cần đăng nhập để đánh giá sản phẩm.');
    }

    await this.ensureApprovedProduct(productId);
    const renterProfile = await this.getRenterProfileByAuthUserId(authUserId);
    const eligibleOrderIds = await this.getCompletedOrderIdsForProduct(
      renterProfile.renter_profile_id,
      productId,
    );

    if (eligibleOrderIds.length === 0) {
      return {
        eligible: false,
        alreadyReviewed: false,
        orderId: null,
        review: null,
        message: 'Bạn chỉ có thể đánh giá sản phẩm sau khi hoàn tất đơn thuê.',
      };
    }

    const existingReview = await this.getExistingProductReview(
      renterProfile.renter_profile_id,
      productId,
    );

    if (existingReview) {
      return {
        eligible: true,
        alreadyReviewed: true,
        orderId: existingReview.order_id,
        review: this.mapPublicReview(existingReview),
        message: 'Bạn đã đánh giá sản phẩm này. Bạn có thể chỉnh sửa đánh giá đã gửi.',
      };
    }

    return {
      eligible: true,
      alreadyReviewed: false,
      orderId: eligibleOrderIds[0],
      review: null,
      message: null,
    };
  }


  async create(authUserId: string | undefined, productId: string, dto: CreateProductReviewDto) {
    if (!authUserId) {
      throw new UnauthorizedException('Bạn cần đăng nhập để đánh giá sản phẩm.');
    }

    const eligibility = await this.getEligibility(authUserId, productId);

    if (eligibility.alreadyReviewed) {
      throw new BadRequestException(
        'Bạn đã đánh giá sản phẩm này. Vui lòng chỉnh sửa đánh giá đã có.',
      );
    }

    if (!eligibility.eligible || !eligibility.orderId) {
      throw new BadRequestException(
        eligibility.message ?? 'Bạn chưa đủ điều kiện đánh giá sản phẩm này.',
      );
    }

    const renterProfile = await this.getRenterProfileByAuthUserId(authUserId);
    const comment = dto.comment?.trim() || null;

    const { data, error } = await this.supabase
      .from('reviews')
      .insert({
        renter_profile_id: renterProfile.renter_profile_id,
        order_id: eligibility.orderId,
        target_type: PRODUCT_TARGET_TYPE,
        target_id: productId,
        rating: dto.rating,
        comment,
      })
      .select(
        `
        review_id,
        renter_profile_id,
        order_id,
        target_id,
        rating,
        comment,
        created_at,
        is_hidden,
        renter_profiles (
          renter_profile_id,
          user_profiles (
            full_name,
            avatar_url
          )
        ),
        review_replies (
          reply_id,
          review_id,
          shop_id,
          content,
          created_at,
          updated_at,
          shop_profiles (
            shop_name
          )
        )
      `,
      )
      .single();

    if (error || !data) {
      const message = error?.code === '23505'
        ? 'Bạn đã đánh giá sản phẩm này cho đơn thuê đã chọn.'
        : `Không thể gửi đánh giá: ${error?.message ?? 'Unknown error'}`;
      throw new BadRequestException(message);
    }

    await this.refreshProductRating(productId);

    return this.mapPublicReview(data);
  }

  async updateMine(authUserId: string | undefined, productId: string, dto: CreateProductReviewDto) {
    if (!authUserId) {
      throw new UnauthorizedException('Bạn cần đăng nhập để chỉnh sửa đánh giá.');
    }

    await this.ensureApprovedProduct(productId);
    const renterProfile = await this.getRenterProfileByAuthUserId(authUserId);
    const existingReview = await this.getExistingProductReview(
      renterProfile.renter_profile_id,
      productId,
    );

    if (!existingReview) {
      throw new NotFoundException('Bạn chưa có đánh giá cho sản phẩm này.');
    }

    const comment = dto.comment?.trim() || null;
    const { data, error } = await this.supabase
      .from('reviews')
      .update({
        rating: dto.rating,
        comment,
        updated_at: new Date().toISOString(),
      })
      .eq('review_id', existingReview.review_id)
      .select(
        `
        review_id,
        renter_profile_id,
        order_id,
        target_id,
        rating,
        comment,
        created_at,
        updated_at,
        is_hidden,
        renter_profiles (
          renter_profile_id,
          user_profiles (
            full_name,
            avatar_url
          )
        ),
        review_replies (
          reply_id,
          review_id,
          shop_id,
          content,
          created_at,
          updated_at,
          shop_profiles (
            shop_name
          )
        )
      `,
      )
      .single();

    if (error || !data) {
      throw new BadRequestException(
        `Không thể cập nhật đánh giá: ${error?.message ?? 'Unknown error'}`,
      );
    }

    await this.refreshProductRating(productId);

    return this.mapPublicReview(data);
  }

  async refreshProductRating(productId: string) {
    const { data, error } = await this.supabase
      .from('reviews')
      .select('rating')
      .eq('target_type', PRODUCT_TARGET_TYPE)
      .eq('target_id', productId)
      .eq('is_hidden', false);

    if (error) {
      throw new InternalServerErrorException(
        `Không thể cập nhật điểm đánh giá: ${error.message}`,
      );
    }

    const ratings = (data ?? []).map((review) => Number(review.rating ?? 0));
    const average = ratings.length
      ? Number((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(2))
      : 0;

    const { error: updateError } = await this.supabase
      .from('products')
      .update({ average_rating: average, updated_at: new Date().toISOString() })
      .eq('product_id', productId);

    if (updateError) {
      throw new InternalServerErrorException(
        `Không thể lưu điểm đánh giá sản phẩm: ${updateError.message}`,
      );
    }

    return { averageRating: average, reviewCount: ratings.length };
  }

  private async ensureApprovedProduct(productId: string) {
    const { data, error } = await this.supabase
      .from('products')
      .select('product_id, status')
      .eq('product_id', productId)
      .eq('status', 'APPROVED')
      .single();

    if (error || !data) {
      throw new NotFoundException('Không tìm thấy sản phẩm có thể đánh giá.');
    }

    return data;
  }

  private async getRenterProfileByAuthUserId(authUserId: string) {
    const { data: profile, error: profileError } = await this.supabase
      .from('user_profiles')
      .select('user_id')
      .eq('auth_user_id', authUserId)
      .single();

    if (profileError || !profile) {
      throw new NotFoundException('Không tìm thấy hồ sơ người dùng.');
    }

    const { data: renterProfile, error: renterError } = await this.supabase
      .from('renter_profiles')
      .select('renter_profile_id')
      .eq('user_id', profile.user_id)
      .single();

    if (renterError || !renterProfile) {
      throw new BadRequestException('Tài khoản của bạn chưa có hồ sơ người thuê.');
    }

    return renterProfile;
  }

  private async getCompletedOrderIdsForProduct(renterProfileId: string, productId: string) {
    const { data: variants, error: variantsError } = await this.supabase
      .from('product_variants')
      .select('variant_id')
      .eq('product_id', productId);

    if (variantsError) {
      throw new InternalServerErrorException(
        `Không thể kiểm tra biến thể sản phẩm: ${variantsError.message}`,
      );
    }

    const variantIds = (variants ?? []).map((variant) => variant.variant_id);
    if (variantIds.length === 0) {
      return [];
    }

    const { data: items, error: itemsError } = await this.supabase
      .from('rental_order_items')
      .select(
        `
        order_id,
        rental_orders!inner (
          order_id,
          renter_profile_id,
          status,
          completed_at
        )
      `,
      )
      .in('variant_id', variantIds)
      .eq('rental_orders.renter_profile_id', renterProfileId)
      .eq('rental_orders.status', 'COMPLETED')
      .order('order_id', { ascending: false });

    if (itemsError) {
      throw new InternalServerErrorException(
        `Không thể kiểm tra đơn thuê đã hoàn tất: ${itemsError.message}`,
      );
    }

    return [...new Set((items ?? []).map((item) => item.order_id).filter(Boolean))];
  }

  private async getExistingProductReview(renterProfileId: string, productId: string) {
    const { data, error } = await this.supabase
      .from('reviews')
      .select(
        `
        review_id,
        renter_profile_id,
        order_id,
        target_id,
        rating,
        comment,
        created_at,
        updated_at,
        is_hidden,
        renter_profiles (
          renter_profile_id,
          user_profiles (
            full_name,
            avatar_url
          )
        ),
        review_replies (
          reply_id,
          review_id,
          shop_id,
          content,
          created_at,
          updated_at,
          shop_profiles (
            shop_name
          )
        )
      `,
      )
      .eq('target_type', PRODUCT_TARGET_TYPE)
      .eq('target_id', productId)
      .eq('renter_profile_id', renterProfileId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `Không thể kiểm tra đánh giá hiện có: ${error.message}`,
      );
    }

    return data;
  }

  private buildSummary(reviews: ProductReviewRow[]) {
    const visibleReviews = reviews.filter((review) => !review.is_hidden);
    const count = visibleReviews.length;
    const averageRating = count
      ? Number(
          (
            visibleReviews.reduce((sum, review) => sum + Number(review.rating ?? 0), 0) /
            count
          ).toFixed(2),
        )
      : 0;

    return { averageRating, count };
  }

  private mapPublicReview(review: ProductReviewRow) {
    const userProfile = Array.isArray(review.renter_profiles?.user_profiles)
      ? review.renter_profiles.user_profiles[0]
      : review.renter_profiles?.user_profiles;

    return {
      review_id: review.review_id,
      rating: Number(review.rating ?? 0),
      comment: review.comment,
      created_at: review.created_at,
      reviewer_name: userProfile?.full_name || 'Người thuê Amonzan',
      reviewer_avatar_url: userProfile?.avatar_url ?? null,
      shop_reply: this.mapReply(review.review_replies),
    };
  }

  private mapReply(replyInput: any) {
    const reply = Array.isArray(replyInput) ? replyInput[0] : replyInput;
    if (!reply) return null;

    const shop = Array.isArray(reply.shop_profiles)
      ? reply.shop_profiles[0]
      : reply.shop_profiles;

    return {
      reply_id: reply.reply_id,
      review_id: reply.review_id,
      shop_id: reply.shop_id,
      shop_name: shop?.shop_name ?? 'Shop Amonzan',
      content: reply.content,
      created_at: reply.created_at,
      updated_at: reply.updated_at,
    };
  }
}
