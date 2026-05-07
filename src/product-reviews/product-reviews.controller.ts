import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CreateProductReviewDto } from './dto/create-product-review.dto';
import { ProductReviewsService } from './product-reviews.service';

@ApiTags('product reviews')
@Controller('products/:productId/reviews')
export class ProductReviewsController {
  constructor(private readonly service: ProductReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'List visible reviews for a product.' })
  @ApiResponse({ status: 200, description: 'Product reviews and summary.' })
  listForProduct(@Param('productId') productId: string) {
    return this.service.listForProduct(productId);
  }

  @Get('eligibility')
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  @ApiOperation({ summary: 'Check whether current user can review this product.' })
  getEligibility(@CurrentUser() user: any, @Param('productId') productId: string) {
    return this.service.getEligibility(user.id, productId);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  @ApiOperation({ summary: 'Create a product review after a completed rental order.' })
  create(
    @CurrentUser() user: any,
    @Param('productId') productId: string,
    @Body() dto: CreateProductReviewDto,
  ) {
    return this.service.create(user.id, productId, dto);
  }

  @Patch('mine')
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  @ApiOperation({ summary: 'Update current user product review.' })
  updateMine(
    @CurrentUser() user: any,
    @Param('productId') productId: string,
    @Body() dto: CreateProductReviewDto,
  ) {
    return this.service.updateMine(user.id, productId, dto);
  }
}
