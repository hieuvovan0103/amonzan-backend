import { Module } from "@nestjs/common";
import { OrdersController } from "./orders.controller";
import { OrderNotificationService } from "./order-notification.service";
import { OrdersService } from "./orders.service";
import { NotificationsModule } from "../modules/notifications/notifications.module";
import { SupabaseModule } from "../supabase/supabase.module";

@Module({
    imports: [SupabaseModule, NotificationsModule],
    controllers: [OrdersController],
    providers: [OrdersService, OrderNotificationService],
    exports: [OrdersService, OrderNotificationService],
})
export class OrdersModule { }