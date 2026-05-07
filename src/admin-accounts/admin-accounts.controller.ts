import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { AdminAccountsService } from './admin-accounts.service';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';

type AuthUser = {
  id: string;
};

@ApiTags('admin accounts')
@ApiBearerAuth()
@Controller('admin/accounts')
@UseGuards(SupabaseAuthGuard)
export class AdminAccountsController {
  constructor(private readonly service: AdminAccountsService) {}

  @Get()
  @ApiOperation({ summary: 'List user accounts and roles for admin.' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('role') role?: string,
  ) {
    return this.service.list(user.id, { search, role });
  }

  @Patch(':userId/roles')
  @ApiOperation({ summary: 'Update non-admin roles for a user.' })
  updateRoles(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: UpdateUserRolesDto,
  ) {
    return this.service.updateRoles(user.id, userId, dto.roles);
  }
}
