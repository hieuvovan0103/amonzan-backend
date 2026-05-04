// src/auth/auth.controller.ts
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { SupabaseAuthGuard } from './guards/supabase-auth.guard'
import { CurrentUser } from './decorators/current-user.decorator'
import { AuthService } from './auth.service'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('bootstrap-profile')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create or sync the current authenticated user profile.' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: { type: 'string' },
        phoneNumber: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Profile bootstrapped.' })
  bootstrapProfile(
    @CurrentUser() user: any,
    @Body() body: { fullName?: string; phoneNumber?: string },
  ) {
    return this.authService.bootstrapProfile(user, body)
  }

  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user and profile.' })
  @ApiResponse({ status: 200, description: 'Current auth user and profile.' })
  getMe(@CurrentUser() user: any) {
    return this.authService.getMe(user)
  }

  @Post('profile')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update basic authenticated user profile fields.' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: { type: 'string' },
        phoneNumber: { type: 'string' },
        idNumber: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Profile updated.' })
  updateProfile(
    @CurrentUser() user: any,
    @Body() body: { fullName?: string; phoneNumber?: string; idNumber?: string },
  ) {
    return this.authService.updateProfile(user, body)
  }

  @Post('phone/start-verification')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start phone verification for the authenticated user.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['phoneNumber'],
      properties: {
        phoneNumber: { type: 'string', example: '+84912345678' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Phone verification started.' })
  startPhoneVerification(
    @CurrentUser() user: any,
    @Body() body: { phoneNumber: string },
  ) {
    return this.authService.startPhoneVerification(user, body)
  }

  @Post('phone/sync')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sync verified phone status from Supabase Auth to local profile.' })
  @ApiResponse({ status: 201, description: 'Phone verification synced.' })
  syncPhoneVerification(
    @CurrentUser() user: any,
  ) {
    return this.authService.syncPhoneVerification(user)
  }
}
