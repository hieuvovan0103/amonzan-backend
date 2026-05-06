import { Module } from "@nestjs/common";
import { NotificationsModule } from "../modules/notifications/notifications.module";
import { SupabaseModule } from "../supabase/supabase.module";
import { AdminDisputesController } from "./admin-disputes.controller";
import { AdminDisputesService } from "./admin-disputes.service";

@Module({
    imports: [SupabaseModule, NotificationsModule],
    controllers: [AdminDisputesController],
    providers: [AdminDisputesService],
})
export class AdminDisputesModule {}
