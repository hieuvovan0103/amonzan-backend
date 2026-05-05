import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { VendorsService } from './vendors.service';
import { RegisterVendorDto } from './dto/register-vendor.dto';
import { UpdateShopProfileDto } from './dto/update-shop-profile.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('vendors')
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get('admin/requests')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List vendor verification requests for admin review.' })
  @ApiQuery({ name: 'status', required: false, enum: ['ALL', 'PENDING', 'VERIFIED', 'REJECTED'] })
  @ApiResponse({ status: 200, description: 'Vendor verification requests.' })
  getVendorVerificationRequests(
    @CurrentUser() user: any,
    @Query('status') status?: 'ALL' | 'PENDING' | 'VERIFIED' | 'REJECTED',
  ) {
    return this.vendorsService.getVendorVerificationRequests(
      user,
      status || 'PENDING',
    );
  }

  @Patch('admin/requests/:shopId/approve')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve a vendor verification request.' })
  @ApiParam({ name: 'shopId', description: 'Shop id.' })
  @ApiResponse({ status: 200, description: 'Vendor request approved.' })
  approveVendorRequest(
    @CurrentUser() user: any,
    @Param('shopId') shopId: string,
  ) {
    return this.vendorsService.reviewVendorRequest(user, shopId, 'VERIFIED');
  }

  @Patch('admin/requests/:shopId/reject')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject a vendor verification request.' })
  @ApiParam({ name: 'shopId', description: 'Shop id.' })
  @ApiResponse({ status: 200, description: 'Vendor request rejected.' })
  rejectVendorRequest(
    @CurrentUser() user: any,
    @Param('shopId') shopId: string,
  ) {
    return this.vendorsService.reviewVendorRequest(user, shopId, 'REJECTED');
  }

  @Post('register')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register the authenticated user as a vendor.' })
  @ApiResponse({ status: 201, description: 'Vendor registration submitted.' })
  @ApiResponse({ status: 400, description: 'Invalid data or duplicate registration.' })
  registerVendor(
    @CurrentUser() user: any,
    @Body() dto: RegisterVendorDto,
  ) {
    return this.vendorsService.registerVendor(user, dto);
  }

  @Get('my-shop')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated vendor shop profile.' })
  @ApiResponse({ status: 200, description: 'Vendor shop profile.' })
  @ApiResponse({ status: 404, description: 'Shop profile not found.' })
  getMyShop(@CurrentUser() user: any) {
    return this.vendorsService.getMyShop(user.id);
  }

  @Patch('my-shop')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update the authenticated vendor shop profile.' })
  @ApiResponse({ status: 200, description: 'Shop profile updated.' })
  @ApiResponse({ status: 400, description: 'Invalid update payload.' })
  updateMyShop(
    @CurrentUser() user: any,
    @Body() dto: UpdateShopProfileDto,
  ) {
    return this.vendorsService.updateMyShop(user.id, dto);
  }
}
