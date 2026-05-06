import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { CreateOrderDto } from "./dto/create-order.dto";
import { ConfirmReturnReceivedDto } from "./dto/confirm-return-received.dto";
import { EarlyReturnRequestDto } from "./dto/early-return-request.dto";
import { RejectEarlyReturnDto } from "./dto/reject-early-return.dto";
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

    @Get("my-paid-orders")
    @ApiOperation({ summary: "List paid rental orders for the authenticated user." })
    getMyPaidOrders(@CurrentUser() user: any) {
        return this.ordersService.getMyPaidOrders(user.id);
    }

    @Get("vendor")
    @ApiOperation({ summary: "List rental orders for the authenticated vendor." })
    getVendorOrders(
        @CurrentUser() user: any,
        @Query("status") status?: string,
    ) {
        return this.ordersService.getVendorOrders(user.id, status);
    }

    @Get("vendor/early-return-requests")
    @ApiOperation({ summary: "List early return requests for the authenticated vendor." })
    getVendorEarlyReturnRequests(@CurrentUser() user: any) {
        return this.ordersService.getVendorEarlyReturnRequests(user.id);
    }

    @Get(":orderId/early-return/estimate-refund")
    @ApiOperation({ summary: "Estimate refund amount for early return." })
    estimateEarlyReturnRefund(
        @CurrentUser() user: any,
        @Param("orderId") orderId: string,
        @Query("requestedReturnAt") requestedReturnAt: string,
    ) {
        return this.ordersService.estimateEarlyReturnRefund(user.id, orderId, requestedReturnAt);
    }

    @Post(":orderId/early-return/request")
    @ApiOperation({ summary: "Request early return for a rental order." })
    requestEarlyReturn(
        @CurrentUser() user: any,
        @Param("orderId") orderId: string,
        @Body() dto: EarlyReturnRequestDto,
    ) {
        return this.ordersService.requestEarlyReturn(user.id, orderId, dto);
    }

    @Patch(":orderId/confirm-received")
    @ApiOperation({ summary: "Confirm that the renter has received the rental items." })
    confirmRenterReceived(@CurrentUser() user: any, @Param("orderId") orderId: string) {
        return this.ordersService.confirmRenterReceived(user.id, orderId);
    }

    @Patch("vendor/:orderId/early-return/approve")
    @ApiOperation({ summary: "Approve an early return request as vendor." })
    approveEarlyReturn(@CurrentUser() user: any, @Param("orderId") orderId: string) {
        return this.ordersService.approveEarlyReturn(user.id, orderId);
    }

    @Patch("vendor/:orderId/early-return/reject")
    @ApiOperation({ summary: "Reject an early return request as vendor." })
    rejectEarlyReturn(
        @CurrentUser() user: any,
        @Param("orderId") orderId: string,
        @Body() dto: RejectEarlyReturnDto,
    ) {
        return this.ordersService.rejectEarlyReturn(user.id, orderId, dto.reason);
    }

    @Patch("vendor/:orderId/return/confirm-received")
    @ApiOperation({ summary: "Confirm returned goods were received as vendor." })
    confirmReturnReceived(
        @CurrentUser() user: any,
        @Param("orderId") orderId: string,
        @Body() dto: ConfirmReturnReceivedDto,
    ) {
        return this.ordersService.confirmReturnReceived(user.id, orderId, dto);
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
