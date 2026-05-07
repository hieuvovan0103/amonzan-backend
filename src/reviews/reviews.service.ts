import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { SupabaseService } from '../supabase/supabase.service';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { ReportReviewDto } from './dto/report-review.dto';

type SupabaseError = {
  message: string;
};

type UserProfileRow = {
  user_id: string;
};

type ReviewReportRow = {
  review_id: string;
  target_type?: string;
  target_id?: string;
  is_hidden: boolean | null;
};

type ShopProfileRow = {
  shop_id: string;
  shop_name?: string | null;
};

type AdminUserRoleRow = {
  user_id: string;
  roles: { role_name: string } | { role_name: string }[] | null;
};

@Injectable()
export class ReviewsService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async report(
    authUserId: string | undefined,
    reviewId: string,
    dto: ReportReviewDto,
  ) {
    if (!authUserId) {
      throw new UnauthorizedException('Bạn cần đăng nhập để báo cáo đánh giá.');
    }

    const supabase = this.supabaseService.client;
    const { data: profile, error: profileError } = (await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('auth_user_id', authUserId)
      .single()) as {
      data: UserProfileRow | null;
      error: SupabaseError | null;
    };

    if (profileError || !profile) {
      throw new UnauthorizedException('Không tìm thấy hồ sơ người dùng.');
    }

    const { data: review, error: reviewError } = (await supabase
      .from('reviews')
      .select('review_id, is_hidden')
      .eq('review_id', reviewId)
      .single()) as {
      data: ReviewReportRow | null;
      error: SupabaseError | null;
    };

    if (reviewError || !review) {
      throw new NotFoundException('Không tìm thấy đánh giá.');
    }

    if (review.is_hidden) {
      throw new BadRequestException('Đánh giá này đã bị ẩn.');
    }

    const { error } = (await supabase
      .from('reviews')
      .update({
        reported_at: new Date().toISOString(),
        reported_by_user_id: profile.user_id,
        report_reason: dto.reason.trim(),
        report_status: 'PENDING',
        updated_at: new Date().toISOString(),
      })
      .eq('review_id', reviewId)) as { error: SupabaseError | null };

    if (error) {
      throw new BadRequestException(
        `Không thể báo cáo đánh giá: ${error.message}`,
      );
    }

    await this.notificationsService.notifyUsers(await this.getAdminUserIds(), {
      type: 'REVIEW_REPORTED',
      title: 'Có báo cáo đánh giá mới',
      content: `Người dùng đã báo cáo đánh giá #${reviewId.slice(0, 8)}.`,
      actionUrl: `/dashboard/admin?tab=reviews&reviewId=${reviewId}`,
      relatedType: 'REVIEW_REPORT',
      relatedId: reviewId,
    });

    return { success: true };
  }

  async reply(
    authUserId: string | undefined,
    reviewId: string,
    dto: ReplyReviewDto,
  ) {
    if (!authUserId) {
      throw new UnauthorizedException('Bạn cần đăng nhập để phản hồi đánh giá.');
    }

    const supabase = this.supabaseService.client;
    const profile = await this.getUserProfile(authUserId);
    const shop = await this.getShopByUserId(profile.user_id);
    const content = dto.content.trim();

    const { data: review, error: reviewError } = (await supabase
      .from('reviews')
      .select('review_id, target_type, target_id, is_hidden')
      .eq('review_id', reviewId)
      .single()) as {
      data: ReviewReportRow | null;
      error: SupabaseError | null;
    };

    if (reviewError || !review) {
      throw new NotFoundException('Không tìm thấy đánh giá.');
    }

    if (review.is_hidden) {
      throw new BadRequestException('Không thể phản hồi đánh giá đã bị ẩn.');
    }

    if (review.target_type !== 'PRODUCT') {
      throw new BadRequestException('Shop chỉ có thể phản hồi đánh giá sản phẩm.');
    }

    await this.assertShopOwnsProduct(shop.shop_id, review.target_id ?? '');

    const now = new Date().toISOString();
    const { data, error } = (await supabase
      .from('review_replies')
      .upsert(
        {
          review_id: reviewId,
          shop_id: shop.shop_id,
          user_id: profile.user_id,
          content,
          updated_at: now,
        },
        { onConflict: 'review_id' },
      )
      .select(
        `
        reply_id,
        review_id,
        shop_id,
        content,
        created_at,
        updated_at,
        shop_profiles (
          shop_name
        )
      `,
      )
      .single()) as { data: any | null; error: SupabaseError | null };

    if (error || !data) {
      throw new BadRequestException(
        `Không thể lưu phản hồi đánh giá: ${error?.message ?? 'Unknown error'}`,
      );
    }

    return this.mapReply(data);
  }

  private async getUserProfile(authUserId: string): Promise<UserProfileRow> {
    const { data: profile, error: profileError } = (await this.supabaseService.client
      .from('user_profiles')
      .select('user_id')
      .eq('auth_user_id', authUserId)
      .single()) as {
      data: UserProfileRow | null;
      error: SupabaseError | null;
    };

    if (profileError || !profile) {
      throw new UnauthorizedException('Không tìm thấy hồ sơ người dùng.');
    }

    return profile;
  }

  private async getShopByUserId(userId: string): Promise<ShopProfileRow> {
    const { data: shop, error } = (await this.supabaseService.client
      .from('shop_profiles')
      .select('shop_id, shop_name')
      .eq('user_id', userId)
      .single()) as {
      data: ShopProfileRow | null;
      error: SupabaseError | null;
    };

    if (error || !shop) {
      throw new BadRequestException('Tài khoản của bạn chưa có gian hàng.');
    }

    return shop;
  }

  private async assertShopOwnsProduct(shopId: string, productId: string) {
    const { data, error } = (await this.supabaseService.client
      .from('products')
      .select('product_id')
      .eq('product_id', productId)
      .eq('shop_id', shopId)
      .single()) as {
      data: { product_id: string } | null;
      error: SupabaseError | null;
    };

    if (error || !data) {
      throw new BadRequestException('Bạn chỉ có thể phản hồi đánh giá của sản phẩm thuộc shop mình.');
    }
  }

  private mapReply(reply: any) {
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

  private async getAdminUserIds(): Promise<string[]> {
    const { data, error } = (await this.supabaseService.client
      .from('user_roles')
      .select(
        `
        user_id,
        roles (
          role_name
        )
      `,
      )) as {
      data: AdminUserRoleRow[] | null;
      error: SupabaseError | null;
    };

    if (error) {
      throw new BadRequestException(
        `Không thể tải danh sách admin: ${error.message}`,
      );
    }

    return [
      ...new Set(
        (data ?? [])
          .filter((item) => {
            const role = Array.isArray(item.roles) ? item.roles[0] : item.roles;
            return role?.role_name === 'ADMIN';
          })
          .map((admin) => admin.user_id)
          .filter(Boolean),
      ),
    ];
  }
}
