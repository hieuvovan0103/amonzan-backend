import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { AdminPaymentsService } from './admin-payments.service';

type AuthUser = {
  id: string;
};

@ApiTags('admin payments')
@ApiBearerAuth()
@Controller('admin/payments')
@UseGuards(SupabaseAuthGuard)
export class AdminPaymentsController {
  constructor(private readonly service: AdminPaymentsService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Get escrow/refund metrics for admin wallet page.' })
  metrics(@CurrentUser() user: AuthUser) {
    return this.service.getMetrics(user.id);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List payment/refund transactions for admin wallet page.' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
  ) {
    return this.service.listTransactions(user.id, {
      limit: limit ? Number(limit) : undefined,
    });
  }
}

