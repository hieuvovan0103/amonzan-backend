import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module";
import { SupabaseModule } from "../supabase/supabase.module";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({
    imports: [SupabaseModule, OrdersModule],
    controllers: [PaymentsController],
    providers: [PaymentsService],
    exports: [PaymentsService],
})
export class PaymentsModule { }