import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { AdminProductReviewService } from './admin-product-review.service';
import { RejectProductReviewDto } from './dto/reject-product-review.dto';

@ApiTags('admin product review')
@ApiBearerAuth()
@Controller('admin/product-reviews')
@UseGuards(SupabaseAuthGuard)
export class AdminProductReviewController {
  constructor(private readonly service: AdminProductReviewService) {}

  @Get()
  @ApiOperation({ summary: 'List products waiting for admin review.' })
  @ApiResponse({ status: 200, description: 'Pending product review list.' })
  listPending(@CurrentUser() user: any) {
    return this.service.listPending(user.id);
  }

  @Get(':productId')
  @ApiOperation({ summary: 'Get product review detail.' })
  @ApiResponse({ status: 200, description: 'Product review detail.' })
  getDetail(@CurrentUser() user: any, @Param('productId') productId: string) {
    return this.service.getDetail(user.id, productId);
  }

  @Patch(':productId/approve')
  @ApiOperation({ summary: 'Approve a pending product.' })
  @ApiResponse({ status: 200, description: 'Product approved.' })
  approve(@CurrentUser() user: any, @Param('productId') productId: string) {
    return this.service.approve(user.id, productId);
  }

  @Patch(':productId/reject')
  @ApiOperation({ summary: 'Reject a pending product with reason.' })
  @ApiResponse({ status: 200, description: 'Product rejected.' })
  reject(
    @CurrentUser() user: any,
    @Param('productId') productId: string,
    @Body() dto: RejectProductReviewDto,
  ) {
    return this.service.reject(user.id, productId, dto.reason);
  }
}
