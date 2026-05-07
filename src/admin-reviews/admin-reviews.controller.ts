import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { AdminReviewsService } from './admin-reviews.service';
import { UpdateReviewReportStatusDto } from './dto/update-review-report-status.dto';

type AuthUser = {
  id: string;
};

@ApiTags('admin reviews')
@ApiBearerAuth()
@Controller('admin/reviews')
@UseGuards(SupabaseAuthGuard)
export class AdminReviewsController {
  constructor(private readonly service: AdminReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'List all marketplace reviews for admin.' })
  @ApiResponse({ status: 200, description: 'Review list.' })
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.id);
  }

  @Patch(':reviewId/hide')
  @ApiOperation({ summary: 'Hide a review from public product pages.' })
  hide(@CurrentUser() user: AuthUser, @Param('reviewId') reviewId: string) {
    return this.service.hide(user.id, reviewId);
  }

  @Patch(':reviewId/report-status')
  @ApiOperation({ summary: 'Resolve or dismiss a reported review.' })
  updateReportStatus(
    @CurrentUser() user: AuthUser,
    @Param('reviewId') reviewId: string,
    @Body() dto: UpdateReviewReportStatusDto,
  ) {
    return this.service.updateReportStatus(user.id, reviewId, dto.status);
  }

  @Delete(':reviewId')
  @ApiOperation({ summary: 'Delete a review.' })
  remove(@CurrentUser() user: AuthUser, @Param('reviewId') reviewId: string) {
    return this.service.remove(user.id, reviewId);
  }
}
