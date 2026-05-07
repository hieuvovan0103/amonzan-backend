import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { CreateVoucherDto } from "./dto/create-voucher.dto";
import { RejectVoucherDto } from "./dto/reject-voucher.dto";
import { UpdateVoucherDto } from "./dto/update-voucher.dto";
import { ValidateVoucherDto } from "./dto/validate-voucher.dto";
import { VouchersService } from "./vouchers.service";

@ApiTags("vouchers")
@Controller()
export class VouchersController {
    constructor(private readonly vouchersService: VouchersService) {}

    @Post("vouchers/validate")
    @ApiOperation({ summary: "Validate an approved voucher for checkout." })
    validateVoucher(@Body() dto: ValidateVoucherDto) {
        return this.vouchersService.validateVoucher(dto);
    }

    @Get("vendor/vouchers")
    @ApiBearerAuth()
    @UseGuards(SupabaseAuthGuard)
    @ApiOperation({ summary: "List vouchers created by the current vendor shop." })
    listVendorVouchers(@CurrentUser() user: any) {
        return this.vouchersService.listVendorVouchers(user.id);
    }

    @Post("vendor/vouchers")
    @ApiBearerAuth()
    @UseGuards(SupabaseAuthGuard)
    @ApiOperation({ summary: "Create a shop voucher draft." })
    createVendorVoucher(@CurrentUser() user: any, @Body() dto: CreateVoucherDto) {
        return this.vouchersService.createVendorVoucher(user.id, dto);
    }

    @Patch("vendor/vouchers/:id")
    @ApiBearerAuth()
    @UseGuards(SupabaseAuthGuard)
    @ApiOperation({ summary: "Update a vendor voucher draft or rejected voucher." })
    updateVendorVoucher(
        @CurrentUser() user: any,
        @Param("id") voucherId: string,
        @Body() dto: UpdateVoucherDto,
    ) {
        return this.vouchersService.updateVendorVoucher(user.id, voucherId, dto);
    }

    @Patch("vendor/vouchers/:id/submit-review")
    @ApiBearerAuth()
    @UseGuards(SupabaseAuthGuard)
    @ApiOperation({ summary: "Submit a vendor voucher for admin approval." })
    submitVendorVoucher(@CurrentUser() user: any, @Param("id") voucherId: string) {
        return this.vouchersService.submitVendorVoucher(user.id, voucherId);
    }

    @Get("admin/vouchers")
    @ApiBearerAuth()
    @UseGuards(SupabaseAuthGuard)
    @ApiOperation({ summary: "List vouchers for admin review." })
    listAdminVouchers(
        @CurrentUser() user: any,
        @Query("status") status?: string,
        @Query("scope") scope?: string,
    ) {
        return this.vouchersService.listAdminVouchers(user.id, { status, scope });
    }

    @Post("admin/vouchers")
    @ApiBearerAuth()
    @UseGuards(SupabaseAuthGuard)
    @ApiOperation({ summary: "Create an approved platform voucher." })
    createAdminVoucher(@CurrentUser() user: any, @Body() dto: CreateVoucherDto) {
        return this.vouchersService.createAdminVoucher(user.id, dto);
    }

    @Patch("admin/vouchers/:id/approve")
    @ApiBearerAuth()
    @UseGuards(SupabaseAuthGuard)
    @ApiOperation({ summary: "Approve a voucher." })
    approveVoucher(@CurrentUser() user: any, @Param("id") voucherId: string) {
        return this.vouchersService.approveAdminVoucher(user.id, voucherId);
    }

    @Patch("admin/vouchers/:id/reject")
    @ApiBearerAuth()
    @UseGuards(SupabaseAuthGuard)
    @ApiOperation({ summary: "Reject a voucher." })
    rejectVoucher(
        @CurrentUser() user: any,
        @Param("id") voucherId: string,
        @Body() dto: RejectVoucherDto,
    ) {
        return this.vouchersService.rejectAdminVoucher(user.id, voucherId, dto.reason);
    }
}

