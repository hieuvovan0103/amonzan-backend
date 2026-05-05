import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ShopsService } from './shops.service';

@ApiTags('public shops')
@Controller('shops')
export class ShopsController {
    constructor(private readonly shopsService: ShopsService) { }

    @Get(':shopId')
    @ApiOperation({ summary: 'Get public shop profile with active products and reviews.' })
    @ApiParam({ name: 'shopId', description: 'Shop id.' })
    @ApiResponse({ status: 200, description: 'Public shop profile.' })
    @ApiResponse({ status: 404, description: 'Shop not found.' })
    getPublicShopProfile(@Param('shopId') shopId: string) {
        return this.shopsService.getPublicShopProfile(shopId);
    }
}
