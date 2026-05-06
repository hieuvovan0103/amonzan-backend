import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { SupabaseService } from "../../supabase/supabase.service";
import { CreateNotificationDto } from "./dto/create-notification.dto";

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

@Injectable()
export class NotificationsService {
    constructor(private readonly supabaseService: SupabaseService) {}

    async createNotification(input: NotificationInput) {
        const { data, error } = await this.supabaseService.client
            .from("notifications")
            .insert(this.toRow(input))
            .select("*")
            .single();

        if (error) {
            throw new BadRequestException(`Không thể tạo thông báo: ${error.message}`);
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
        const rows = notifications.filter((item) => item.userId).map((item) => this.toRow(item));
        if (rows.length === 0) return [];

        const { data, error } = await this.supabaseService.client
            .from("notifications")
            .insert(rows)
            .select("*");

        if (error) {
            throw new BadRequestException(`Không thể tạo thông báo: ${error.message}`);
        }

        return (data ?? []).map((item) => this.mapNotification(item));
    }

    async notifyUsers(userIds: string[], payload: Omit<NotificationInput, "userId">) {
        const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
        return this.createMany(uniqueUserIds.map((userId) => ({ userId, ...payload })));
    }

    async listForAuthUser(authUserId: string, query: ListNotificationsQuery = {}) {
        const profile = await this.getUserProfile(authUserId);
        const page = Math.max(1, Number(query.page || 1));
        const limit = Math.min(50, Math.max(1, Number(query.limit || 20)));
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let request = this.supabaseService.client
            .from("notifications")
            .select("*", { count: "exact" })
            .eq("user_id", profile.user_id)
            .order("created_at", { ascending: false })
            .range(from, to);

        if (query.type && query.type !== "ALL") {
            request = request.eq("type", query.type);
        }

        const [{ data, error, count }, unreadCount] = await Promise.all([
            request,
            this.countUnreadByUserId(profile.user_id),
        ]);

        if (error) {
            throw new BadRequestException(`Không thể tải thông báo: ${error.message}`);
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
        return { unreadCount: await this.countUnreadByUserId(profile.user_id) };
    }

    async markAsRead(authUserId: string, notificationId: string) {
        const profile = await this.getUserProfile(authUserId);
        const { data, error } = await this.supabaseService.client
            .from("notifications")
            .update({ is_read: true })
            .eq("notification_id", notificationId)
            .eq("user_id", profile.user_id)
            .select("*")
            .maybeSingle();

        if (error) {
            throw new BadRequestException(`Không thể đánh dấu đã đọc: ${error.message}`);
        }
        if (!data) {
            throw new NotFoundException("Không tìm thấy thông báo");
        }

        return { notification: this.mapNotification(data) };
    }

    async markAllAsRead(authUserId: string) {
        const profile = await this.getUserProfile(authUserId);
        const { error } = await this.supabaseService.client
            .from("notifications")
            .update({ is_read: true })
            .eq("user_id", profile.user_id)
            .eq("is_read", false);

        if (error) {
            throw new BadRequestException(`Không thể đánh dấu tất cả đã đọc: ${error.message}`);
        }

        return { message: "Đã đánh dấu tất cả thông báo là đã đọc." };
    }

    private async countUnreadByUserId(userId: string) {
        const { count, error } = await this.supabaseService.client
            .from("notifications")
            .select("notification_id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("is_read", false);

        if (error) {
            throw new BadRequestException(`Không thể đếm thông báo chưa đọc: ${error.message}`);
        }

        return count ?? 0;
    }

    private async getUserProfile(authUserId: string) {
        const { data, error } = await this.supabaseService.client
            .from("user_profiles")
            .select("user_id")
            .eq("auth_user_id", authUserId)
            .single();

        if (error || !data) {
            throw new NotFoundException("Không tìm thấy hồ sơ người dùng");
        }

        return data;
    }

    private async assertAdmin(userId: string) {
        const { data, error } = await this.supabaseService.client
            .from("admin_profiles")
            .select("admin_id")
            .eq("user_id", userId)
            .maybeSingle();

        if (error || !data) {
            throw new ForbiddenException("Bạn không có quyền tạo thông báo");
        }
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

    private mapNotification(notification: any) {
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
