import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { AdminDashboardService } from './admin-dashboard.service';

type AuthUser = {
  id: string;
};

@ApiTags('admin dashboard')
@ApiBearerAuth()
@Controller('admin/dashboard')
@UseGuards(SupabaseAuthGuard)
export class AdminDashboardController {
  constructor(private readonly service: AdminDashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get real admin overview metrics.' })
  overview(@CurrentUser() user: AuthUser) {
    return this.service.getOverview(user.id);
  }
}
