import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { CreateReturnComplaintDto } from "./dto/create-return-complaint.dto";
import { CreateReturnRequestDto } from "./dto/create-return-request.dto";
import { ResolveReturnDisputeDto } from "./dto/resolve-return-dispute.dto";
import { VendorConfirmReturnDto } from "./dto/vendor-confirm-return.dto";
import { VendorReportReturnIssueDto } from "./dto/vendor-report-return-issue.dto";
import { ReturnsService } from "./returns.service";

@ApiTags("returns")
@ApiBearerAuth()
@Controller()
@UseGuards(SupabaseAuthGuard)
export class ReturnsController {
    constructor(private readonly returnsService: ReturnsService) {}

    @Post("orders/:orderId/return-request")
    @ApiOperation({ summary: "Create a return request for a rental order." })
    createReturnRequest(
        @CurrentUser() user: any,
        @Param("orderId") orderId: string,
        @Body() dto: CreateReturnRequestDto,
    ) {
        return this.returnsService.createReturnRequest(user.id, orderId, dto);
    }

    @Get("me/return-requests")
    @ApiOperation({ summary: "List return requests for the current renter." })
    getMyReturnRequests(
        @CurrentUser() user: any,
        @Query("status") status?: string,
        @Query("page") page?: string,
        @Query("limit") limit?: string,
    ) {
        return this.returnsService.getMyReturnRequests(user.id, { status, page, limit });
    }

    @Get("vendor/return-requests")
    @ApiOperation({ summary: "List return requests for the current vendor." })
    getVendorReturnRequests(
        @CurrentUser() user: any,
        @Query("status") status?: string,
        @Query("page") page?: string,
        @Query("limit") limit?: string,
    ) {
        return this.returnsService.getVendorReturnRequests(user.id, { status, page, limit });
    }

    @Get("return-requests/:orderId")
    @ApiOperation({ summary: "Get return request details." })
    getReturnRequestDetail(@CurrentUser() user: any, @Param("orderId") orderId: string) {
        return this.returnsService.getReturnRequestDetail(user.id, orderId);
    }

    @Patch("vendor/return-requests/:orderId/confirm")
    @ApiOperation({ summary: "Confirm returned goods as vendor." })
    confirmReturn(
        @CurrentUser() user: any,
        @Param("orderId") orderId: string,
        @Body() dto: VendorConfirmReturnDto,
    ) {
        return this.returnsService.confirmReturn(user.id, orderId, dto);
    }

    @Patch("vendor/return-requests/:orderId/report-issue")
    @ApiOperation({ summary: "Report a return issue as vendor." })
    reportReturnIssue(
        @CurrentUser() user: any,
        @Param("orderId") orderId: string,
        @Body() dto: VendorReportReturnIssueDto,
    ) {
        return this.returnsService.reportReturnIssue(user.id, orderId, dto);
    }

    @Post("orders/:orderId/return-complaint")
    @ApiOperation({ summary: "Create a complaint for a return result." })
    createReturnComplaint(
        @CurrentUser() user: any,
        @Param("orderId") orderId: string,
        @Body() dto: CreateReturnComplaintDto,
    ) {
        return this.returnsService.createReturnComplaint(user.id, orderId, dto);
    }

    @Post("orders/:orderId/early-return-complaint")
    @ApiOperation({ summary: "Create a complaint for a rejected early return request." })
    createEarlyReturnComplaint(
        @CurrentUser() user: any,
        @Param("orderId") orderId: string,
        @Body() dto: CreateReturnComplaintDto,
    ) {
        return this.returnsService.createEarlyReturnComplaint(user.id, orderId, dto);
    }

    @Get("admin/return-disputes")
    @ApiOperation({ summary: "List return and early-return disputes for admin." })
    getAdminReturnDisputes(@CurrentUser() user: any) {
        return this.returnsService.getAdminReturnDisputes(user.id);
    }

    @Patch("admin/return-disputes/:disputeId/resolve")
    @ApiOperation({ summary: "Resolve a return or early-return dispute as admin." })
    resolveAdminReturnDispute(
        @CurrentUser() user: any,
        @Param("disputeId") disputeId: string,
        @Body() dto: ResolveReturnDisputeDto,
    ) {
        return this.returnsService.resolveAdminReturnDispute(user.id, disputeId, dto);
    }
}
