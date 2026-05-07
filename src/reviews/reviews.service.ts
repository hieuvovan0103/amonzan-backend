import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { SupabaseService } from '../supabase/supabase.service';
import { ReportReviewDto } from './dto/report-review.dto';

type SupabaseError = {
  message: string;
};

type UserProfileRow = {
  user_id: string;
};

type ReviewReportRow = {
  review_id: string;
  is_hidden: boolean | null;
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
