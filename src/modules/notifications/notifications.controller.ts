import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { SupabaseAuthGuard } from "../../auth/guards/supabase-auth.guard";
import { CreateNotificationDto } from "./dto/create-notification.dto";
import { NotificationsService } from "./notifications.service";

@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
@UseGuards(SupabaseAuthGuard)
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) {}

    @Get()
    @ApiOperation({ summary: "List notifications for current user." })
    list(
        @CurrentUser() user: any,
        @Query("page") page?: string,
        @Query("limit") limit?: string,
        @Query("type") type?: string,
    ) {
        return this.notificationsService.listForAuthUser(user.id, { page, limit, type });
    }

    @Get("unread-count")
    @ApiOperation({ summary: "Get unread notification count for current user." })
    getUnreadCount(@CurrentUser() user: any) {
        return this.notificationsService.getUnreadCount(user.id);
    }

    @Post()
    @ApiOperation({ summary: "Create a notification. Admin only." })
    create(@CurrentUser() user: any, @Body() dto: CreateNotificationDto) {
        return this.notificationsService.createAsAdmin(user.id, dto);
    }

    @Patch("read-all")
    @ApiOperation({ summary: "Mark all current user notifications as read." })
    markAllAsRead(@CurrentUser() user: any) {
        return this.notificationsService.markAllAsRead(user.id);
    }

    @Patch(":id/read")
    @ApiOperation({ summary: "Mark one notification as read." })
    markAsRead(@CurrentUser() user: any, @Param("id") notificationId: string) {
        return this.notificationsService.markAsRead(user.id, notificationId);
    }
}
