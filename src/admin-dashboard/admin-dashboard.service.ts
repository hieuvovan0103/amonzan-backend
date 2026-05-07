import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

type SupabaseError = {
  message: string;
};

type CountResult = {
  count: number | null;
  error: SupabaseError | null;
};

type UserRoleRow = {
  roles: { role_name: string } | { role_name: string }[] | null;
};

type UserProfileWithRoles = {
  user_id: string;
  user_roles?: UserRoleRow[] | null;
};

@Injectable()
export class AdminDashboardService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getOverview(authUserId: string) {
    await this.ensureAdmin(authUserId);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      pendingReviewReports,
      openDisputes,
      vendorRequests,
      activeOrders,
      totalOrders,
      hiddenReviews,
      recentOrders,
    ] = await Promise.all([
      this.resolveCount(
        this.supabaseService.client
          .from('user_profiles')
          .select('*', { count: 'exact', head: true }),
      ),
      this.resolveCount(
        this.supabaseService.client
          .from('reviews')
          .select('*', { count: 'exact', head: true })
          .eq('report_status', 'PENDING'),
      ),
      this.resolveCount(
        this.supabaseService.client
          .from('disputes')
          .select('*', { count: 'exact', head: true })
          .in('status', ['OPEN', 'UNDER_REVIEW', 'NEED_MORE_EVIDENCE']),
      ),
      this.resolveCount(
        this.supabaseService.client
          .from('shop_profiles')
          .select('*', { count: 'exact', head: true })
          .eq('verification_status', 'PENDING'),
      ),
      this.resolveCount(
        this.supabaseService.client
          .from('rental_orders')
          .select('*', { count: 'exact', head: true })
          .in('status', [
            'CONFIRMED',
            'READY_FOR_PICKUP',
            'IN_RENTAL',
            'RETURN_PENDING',
            'LATE',
          ]),
      ),
      this.resolveCount(
        this.supabaseService.client
          .from('rental_orders')
          .select('*', { count: 'exact', head: true }),
      ),
      this.resolveCount(
        this.supabaseService.client
          .from('reviews')
          .select('*', { count: 'exact', head: true })
          .eq('is_hidden', true),
      ),
      this.resolveCount(
        this.supabaseService.client
          .from('rental_orders')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', sevenDaysAgo.toISOString()),
      ),
    ]);

    return {
      metrics: {
        totalUsers,
        pendingReviewReports,
        openDisputes,
        vendorRequests,
        activeOrders,
        totalOrders,
        hiddenReviews,
        recentOrders,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private async resolveCount(query: PromiseLike<unknown>): Promise<number> {
    const { count, error } = (await query) as CountResult;
    if (error) {
      return 0;
    }

    return count ?? 0;
  }

  private async ensureAdmin(authUserId: string) {
    const { data, error } = (await this.supabaseService.client
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
      .single()) as {
      data: UserProfileWithRoles | null;
      error: SupabaseError | null;
    };

    if (error || !data) {
      throw new NotFoundException('Không tìm thấy hồ sơ người dùng.');
    }

    const roles =
      data.user_roles
        ?.map((userRole) => {
          const role = Array.isArray(userRole.roles)
            ? userRole.roles[0]
            : userRole.roles;
          return role?.role_name;
        })
        .filter(Boolean) ?? [];

    if (!roles.includes('ADMIN')) {
      throw new ForbiddenException(
        'Chỉ admin mới được xem tổng quan hệ thống.',
      );
    }

    return data;
  }
}
