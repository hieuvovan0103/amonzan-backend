import { Module } from "@nestjs/common";
import { SupabaseModule } from "../supabase/supabase.module";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({
    imports: [SupabaseModule],
    controllers: [PaymentsController],
    providers: [PaymentsService],
    exports: [PaymentsService],
})
export class PaymentsModule { }