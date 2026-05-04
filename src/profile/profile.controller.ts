import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@ApiTags('profile')
@ApiBearerAuth()
@Controller('profile')
@UseGuards(SupabaseAuthGuard)
export class ProfileController {
    constructor(private readonly profileService: ProfileService) { }

    @Get('me')
    @ApiOperation({ summary: 'Get the authenticated user profile.' })
    @ApiResponse({ status: 200, description: 'Profile detail.' })
    getMe(@CurrentUser() user: any) {
        return this.profileService.getProfile(user.id);
    }

    @Patch('me')
    @ApiOperation({ summary: 'Update the authenticated user profile.' })
    @ApiResponse({ status: 200, description: 'Profile updated.' })
    updateMe(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
        return this.profileService.updateProfile(user.id, dto);
    }

    @Get('notifications')
    @ApiOperation({ summary: 'List profile notifications.' })
    @ApiResponse({ status: 200, description: 'Notification list.' })
    getNotifications(@CurrentUser() user: any) {
        return this.profileService.getNotifications(user.id);
    }

    @Patch('notifications/read-all')
    @ApiOperation({ summary: 'Mark all notifications as read.' })
    @ApiResponse({ status: 200, description: 'Notifications marked as read.' })
    markAllNotificationsAsRead(@CurrentUser() user: any) {
        return this.profileService.markAllNotificationsAsRead(user.id);
    }

    @Get('orders')
    @ApiOperation({ summary: 'List orders for the authenticated user.' })
    @ApiResponse({ status: 200, description: 'Order list.' })
    getOrders(@CurrentUser() user: any) {
        return this.profileService.getMyOrders(user.id);
    }

    @Get('addresses')
    @ApiOperation({ summary: 'List addresses for the authenticated user.' })
    @ApiResponse({ status: 200, description: 'Address list.' })
    getAddresses(@CurrentUser() user: any) {
        return this.profileService.getAddresses(user.id);
    }

    @Post('addresses')
    @ApiOperation({ summary: 'Create a profile address.' })
    @ApiResponse({ status: 201, description: 'Address created.' })
    createAddress(@CurrentUser() user: any, @Body() dto: CreateAddressDto) {
        return this.profileService.createAddress(user.id, dto);
    }

    @Patch('addresses/:id')
    @ApiOperation({ summary: 'Update a profile address.' })
    @ApiParam({ name: 'id', description: 'Address id.' })
    @ApiResponse({ status: 200, description: 'Address updated.' })
    updateAddress(
        @CurrentUser() user: any,
        @Param('id') addressId: string,
        @Body() dto: UpdateAddressDto,
    ) {
        return this.profileService.updateAddress(user.id, addressId, dto);
    }

    @Delete('addresses/:id')
    @ApiOperation({ summary: 'Delete a profile address.' })
    @ApiParam({ name: 'id', description: 'Address id.' })
    @ApiResponse({ status: 200, description: 'Address deleted.' })
    deleteAddress(@CurrentUser() user: any, @Param('id') addressId: string) {
        return this.profileService.deleteAddress(user.id, addressId);
    }
}
