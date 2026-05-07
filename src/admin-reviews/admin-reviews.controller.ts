import { Controller, Delete, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { AdminReviewsService } from './admin-reviews.service';

@ApiTags('admin reviews')
@ApiBearerAuth()
@Controller('admin/reviews')
@UseGuards(SupabaseAuthGuard)
export class AdminReviewsController {
  constructor(private readonly service: AdminReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'List all marketplace reviews for admin.' })
  @ApiResponse({ status: 200, description: 'Review list.' })
  list(@CurrentUser() user: any) {
    return this.service.list(user.id);
  }

  @Patch(':reviewId/hide')
  @ApiOperation({ summary: 'Hide a review from public product pages.' })
  hide(@CurrentUser() user: any, @Param('reviewId') reviewId: string) {
    return this.service.hide(user.id, reviewId);
  }

  @Delete(':reviewId')
  @ApiOperation({ summary: 'Delete a review.' })
  remove(@CurrentUser() user: any, @Param('reviewId') reviewId: string) {
    return this.service.remove(user.id, reviewId);
  }
}
