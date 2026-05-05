import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { CreateOrderDto } from "./dto/create-order.dto";
import { OrdersService } from "./orders.service";

@ApiTags("orders")
@ApiBearerAuth()
@Controller("orders")
@UseGuards(SupabaseAuthGuard)
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) {}

    @Post()
    @ApiOperation({ summary: "Create a rental order for the authenticated user." })
    @ApiResponse({ status: 201, description: "Order created." })
    createOrder(@CurrentUser() user: any, @Body() dto: CreateOrderDto) {
        return this.ordersService.createOrder(user.id, dto);
    }

    @Get("vendor")
    @ApiOperation({ summary: "List rental orders for the authenticated vendor." })
    getVendorOrders(
        @CurrentUser() user: any,
        @Query("status") status?: string,
    ) {
        return this.ordersService.getVendorOrders(user.id, status);
    }

    @Patch(":orderId/vendor-approve")
    @ApiOperation({ summary: "Approve a paid rental order as vendor." })
    approveVendorOrder(@CurrentUser() user: any, @Param("orderId") orderId: string) {
        return this.ordersService.reviewVendorOrder(user.id, orderId, "approve");
    }

    @Patch(":orderId/vendor-reject")
    @ApiOperation({ summary: "Reject a paid rental order as vendor." })
    rejectVendorOrder(@CurrentUser() user: any, @Param("orderId") orderId: string) {
        return this.ordersService.reviewVendorOrder(user.id, orderId, "reject");
    }
}
