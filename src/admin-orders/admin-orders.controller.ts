import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { AdminOrdersService } from './admin-orders.service';

type AuthUser = { id: string };

@ApiTags('admin orders')
@ApiBearerAuth()
@Controller('admin/orders')
@UseGuards(SupabaseAuthGuard)
export class AdminOrdersController {
  constructor(private readonly service: AdminOrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List rental orders for admin with pagination.' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.service.list(user.id, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      status: status && status !== 'ALL' ? status : undefined,
      search: search?.trim() || undefined,
    });
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'Get admin rental order detail.' })
  detail(@CurrentUser() user: AuthUser, @Param('orderId') orderId: string) {
    return this.service.getDetail(user.id, orderId);
  }
}

