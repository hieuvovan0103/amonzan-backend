import { Module } from "@nestjs/common";
import { NotificationsModule } from "../modules/notifications/notifications.module";
import { SupabaseModule } from "../supabase/supabase.module";
import { ReturnsController } from "./returns.controller";
import { ReturnsService } from "./returns.service";

@Module({
    imports: [SupabaseModule, NotificationsModule],
    controllers: [ReturnsController],
    providers: [ReturnsService],
})
export class ReturnsModule {}
