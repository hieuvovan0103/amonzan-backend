// src/auth/auth.controller.ts
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { SupabaseAuthGuard } from './guards/supabase-auth.guard'
import { CurrentUser } from './decorators/current-user.decorator'
import { AuthService } from './auth.service'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('bootstrap-profile')
  @UseGuards(SupabaseAuthGuard)
  bootstrapProfile(
    @CurrentUser() user: any,
    @Body() body: { fullName?: string; phoneNumber?: string },
  ) {
    return this.authService.bootstrapProfile(user, body)
  }

  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  getMe(@CurrentUser() user: any) {
    return this.authService.getMe(user)
  }
}