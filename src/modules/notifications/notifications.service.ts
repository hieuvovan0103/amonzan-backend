import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

type NotificationInput = {
  userId: string;
  type: string;
  title: string;
  content?: string | null;
  actionUrl?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
};

type ListNotificationsQuery = {
  page?: string;
  limit?: string;
  type?: string;
};

type SupabaseError = {
  message: string;
};

type UserProfileRow = {
  user_id: string;
};

type RoleJoinRow = {
  roles: { role_name: string } | { role_name: string }[] | null;
};

type NotificationRow = {
  notification_id: string;
  user_id: string;
  type: string;
  title: string;
  content: string | null;
  is_read: boolean | null;
  action_url: string | null;
  related_type: string | null;
  related_id: string | null;
  created_at: string;
};

const ADMIN_VISIBLE_RELATED_TYPES = ['DISPUTE', 'REVIEW_REPORT'];

@Injectable()
export class NotificationsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async createNotification(input: NotificationInput) {
    const { data, error } = (await this.supabaseService.client
      .from('notifications')
      .insert(this.toRow(input))
      .select('*')
      .single()) as {
      data: NotificationRow | null;
      error: SupabaseError | null;
    };

    if (error) {
      throw new BadRequestException(
        `Không thể tạo thông báo: ${error.message}`,
      );
    }
    if (!data) {
      throw new BadRequestException('Không thể tạo thông báo');
    }

    return this.mapNotification(data);
  }

  async create(dto: CreateNotificationDto) {
    return this.createNotification({
      userId: dto.userId,
      type: dto.type,
      title: dto.title,
      content: dto.content,
      actionUrl: dto.actionUrl,
      relatedType: dto.relatedType,
      relatedId: dto.relatedId,
    });
  }

  async createAsAdmin(authUserId: string, dto: CreateNotificationDto) {
    const profile = await this.getUserProfile(authUserId);
    await this.assertAdmin(profile.user_id);
    return { notification: await this.create(dto) };
  }

  async createMany(notifications: NotificationInput[]) {
    const rows = notifications
      .filter((item) => item.userId)
      .map((item) => this.toRow(item));
    if (rows.length === 0) return [];

    const { data, error } = (await this.supabaseService.client
      .from('notifications')
      .insert(rows)
      .select('*')) as {
      data: NotificationRow[] | null;
      error: SupabaseError | null;
    };

    if (error) {
      throw new BadRequestException(
        `Không thể tạo thông báo: ${error.message}`,
      );
    }

    return (data ?? []).map((item) => this.mapNotification(item));
  }

  async notifyUsers(
    userIds: string[],
    payload: Omit<NotificationInput, 'userId'>,
  ) {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    return this.createMany(
      uniqueUserIds.map((userId) => ({ userId, ...payload })),
    );
  }

  async listForAuthUser(
    authUserId: string,
    query: ListNotificationsQuery = {},
  ) {
    const profile = await this.getUserProfile(authUserId);
    const isAdmin = await this.isAdmin(profile.user_id);
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(query.limit || 20)));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let request = this.supabaseService.client
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', profile.user_id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (isAdmin) {
      request = request.in('related_type', ADMIN_VISIBLE_RELATED_TYPES);
    }

    if (query.type && query.type !== 'ALL') {
      request = request.eq('type', query.type);
    }

    const [{ data, error, count }, unreadCount] = await Promise.all([
      request as unknown as Promise<{
        data: NotificationRow[] | null;
        error: SupabaseError | null;
        count: number | null;
      }>,
      this.countUnreadByUserId(
        profile.user_id,
        isAdmin ? ADMIN_VISIBLE_RELATED_TYPES : undefined,
      ),
    ]);

    if (error) {
      throw new BadRequestException(
        `Không thể tải thông báo: ${error.message}`,
      );
    }

    return {
      notifications: (data ?? []).map((item) => this.mapNotification(item)),
      unreadCount,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)),
      },
    };
  }

  async getUnreadCount(authUserId: string) {
    const profile = await this.getUserProfile(authUserId);
    const isAdmin = await this.isAdmin(profile.user_id);
    return {
      unreadCount: await this.countUnreadByUserId(
        profile.user_id,
        isAdmin ? ADMIN_VISIBLE_RELATED_TYPES : undefined,
      ),
    };
  }

  async markAsRead(authUserId: string, notificationId: string) {
    const profile = await this.getUserProfile(authUserId);
    const { data, error } = (await this.supabaseService.client
      .from('notifications')
      .update({ is_read: true })
      .eq('notification_id', notificationId)
      .eq('user_id', profile.user_id)
      .select('*')
      .maybeSingle()) as {
      data: NotificationRow | null;
      error: SupabaseError | null;
    };

    if (error) {
      throw new BadRequestException(
        `Không thể đánh dấu đã đọc: ${error.message}`,
      );
    }
    if (!data) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }

    return { notification: this.mapNotification(data) };
  }

  async markAllAsRead(authUserId: string) {
    const profile = await this.getUserProfile(authUserId);
    const isAdmin = await this.isAdmin(profile.user_id);
    let request = this.supabaseService.client
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', profile.user_id)
      .eq('is_read', false);

    if (isAdmin) {
      request = request.in('related_type', ADMIN_VISIBLE_RELATED_TYPES);
    }

    const { error } = (await request) as { error: SupabaseError | null };

    if (error) {
      throw new BadRequestException(
        `Không thể đánh dấu tất cả đã đọc: ${error.message}`,
      );
    }

    return { message: 'Đã đánh dấu tất cả thông báo là đã đọc.' };
  }

  private async countUnreadByUserId(userId: string, relatedTypes?: string[]) {
    let request = this.supabaseService.client
      .from('notifications')
      .select('notification_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (relatedTypes?.length) {
      request = request.in('related_type', relatedTypes);
    }

    const { count, error } = (await request) as {
      count: number | null;
      error: SupabaseError | null;
    };

    if (error) {
      throw new BadRequestException(
        `Không thể đếm thông báo chưa đọc: ${error.message}`,
      );
    }

    return count ?? 0;
  }

  private async getUserProfile(authUserId: string): Promise<UserProfileRow> {
    const { data, error } = (await this.supabaseService.client
      .from('user_profiles')
      .select('user_id')
      .eq('auth_user_id', authUserId)
      .single()) as {
      data: UserProfileRow | null;
      error: SupabaseError | null;
    };

    if (error || !data) {
      throw new NotFoundException('Không tìm thấy hồ sơ người dùng');
    }

    return data;
  }

  private async assertAdmin(userId: string) {
    const { data, error } = (await this.supabaseService.client
      .from('user_roles')
      .select(
        `
        roles (
          role_name
        )
      `,
      )
      .eq('user_id', userId)) as {
      data: RoleJoinRow[] | null;
      error: SupabaseError | null;
    };

    if (error || !this.extractRoles(data).includes('ADMIN')) {
      throw new ForbiddenException('Bạn không có quyền tạo thông báo');
    }
  }

  private async isAdmin(userId: string) {
    const { data, error } = (await this.supabaseService.client
      .from('user_roles')
      .select(
        `
        roles (
          role_name
        )
      `,
      )
      .eq('user_id', userId)) as {
      data: RoleJoinRow[] | null;
      error: SupabaseError | null;
    };

    return Boolean(!error && this.extractRoles(data).includes('ADMIN'));
  }

  private extractRoles(userRoles?: RoleJoinRow[] | null) {
    return (
      userRoles
        ?.map((userRole) => {
          const role = Array.isArray(userRole.roles)
            ? userRole.roles[0]
            : userRole.roles;
          return role?.role_name;
        })
        .filter(Boolean) ?? []
    );
  }

  private toRow(notification: NotificationInput) {
    return {
      user_id: notification.userId,
      type: notification.type,
      title: notification.title,
      content: notification.content ?? null,
      action_url: notification.actionUrl ?? null,
      related_type: notification.relatedType ?? null,
      related_id: notification.relatedId ?? null,
    };
  }

  private mapNotification(notification: NotificationRow) {
    return {
      notificationId: notification.notification_id,
      userId: notification.user_id,
      type: notification.type,
      title: notification.title,
      content: notification.content,
      isRead: Boolean(notification.is_read),
      actionUrl: notification.action_url,
      relatedType: notification.related_type,
      relatedId: notification.related_id,
      createdAt: notification.created_at,
    };
  }
}
