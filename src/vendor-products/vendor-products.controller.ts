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
    ApiBody,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { VendorProductsService } from './vendor-products.service';
import { CreateVendorProductDto } from './dto/create-vendor-product.dto';
import { UpdateVendorProductDto } from './dto/update-vendor-product.dto';

@ApiTags('vendor products')
@ApiBearerAuth()
@Controller('vendor/products')
@UseGuards(SupabaseAuthGuard)
export class VendorProductsController {
    constructor(private readonly service: VendorProductsService) { }

    @Get()
    @ApiOperation({ summary: 'List products owned by the authenticated vendor shop.' })
    @ApiResponse({ status: 200, description: 'Vendor product list.' })
    getMyProducts(@CurrentUser() user: any) {
        return this.service.getMyProducts(user.id);
    }

    @Get(':productId')
    @ApiOperation({ summary: 'Get a vendor-owned product detail.' })
    @ApiParam({ name: 'productId', description: 'Product id.' })
    @ApiResponse({ status: 200, description: 'Vendor product detail.' })
    @ApiResponse({ status: 404, description: 'Product not found or not owned by vendor.' })
    getProductDetail(
        @CurrentUser() user: any,
        @Param('productId') productId: string,
    ) {
        return this.service.getProductDetail(user.id, productId);
    }

    @Post()
    @ApiOperation({ summary: 'Create a product for the authenticated vendor shop.' })
    @ApiResponse({ status: 201, description: 'Product created.' })
    @ApiResponse({ status: 400, description: 'Invalid product payload.' })
    createProduct(
        @CurrentUser() user: any,
        @Body() dto: CreateVendorProductDto,
    ) {
        return this.service.createProduct(user.id, dto);
    }

    @Patch(':productId')
    @ApiOperation({ summary: 'Update a vendor-owned product.' })
    @ApiParam({ name: 'productId', description: 'Product id.' })
    @ApiResponse({ status: 200, description: 'Product updated.' })
    @ApiResponse({ status: 400, description: 'Invalid update payload.' })
    updateProduct(
        @CurrentUser() user: any,
        @Param('productId') productId: string,
        @Body() dto: UpdateVendorProductDto,
    ) {
        return this.service.updateProduct(user.id, productId, dto);
    }

    @Patch(':productId/status')
    @ApiOperation({ summary: 'Update product status.' })
    @ApiParam({ name: 'productId', description: 'Product id.' })
    @ApiBody({
        schema: {
            type: 'object',
            required: ['status'],
            properties: {
                status: { type: 'string', enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'] },
            },
        },
    })
    @ApiResponse({ status: 200, description: 'Status updated.' })
    updateStatus(
        @CurrentUser() user: any,
        @Param('productId') productId: string,
        @Body() body: { status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' },
    ) {
        return this.service.updateProductStatus(user.id, productId, body.status);
    }

    @Delete(':productId')
    @ApiOperation({ summary: 'Archive a vendor-owned product.' })
    @ApiParam({ name: 'productId', description: 'Product id.' })
    @ApiResponse({ status: 200, description: 'Product archived.' })
    archiveProduct(
        @CurrentUser() user: any,
        @Param('productId') productId: string,
    ) {
        return this.service.updateProductStatus(user.id, productId, 'ARCHIVED');
    }
}
