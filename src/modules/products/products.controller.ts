import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductAvailabilityQueryDto } from './dto/product-availability-query.dto';

@ApiTags('public products')
@Controller('products')
export class ProductsController {
    constructor(private readonly productsService: ProductsService) { }

    @Get()
    @ApiOperation({ summary: 'List public active products with filters and pagination.' })
    @ApiResponse({ status: 200, description: 'Paginated public product cards.' })
    findPublicProducts(@Query() query: ProductQueryDto) {
        return this.productsService.findPublicProducts(query);
    }

    @Get(':slug/availability')
    @ApiOperation({ summary: 'Check product variant availability for a rental date range.' })
    @ApiParam({ name: 'slug', description: 'Product slug.' })
    @ApiResponse({ status: 200, description: 'Availability result.' })
    checkAvailability(
        @Param('slug') slug: string,
        @Query() query: ProductAvailabilityQueryDto,
    ) {
        return this.productsService.checkAvailability(slug, query);
    }

    @Get(':slug')
    @ApiOperation({ summary: 'Get public product detail by slug.' })
    @ApiParam({ name: 'slug', description: 'Product slug.' })
    @ApiResponse({ status: 200, description: 'Public product detail.' })
    @ApiResponse({ status: 404, description: 'Product not found.' })
    findPublicProductDetail(@Param('slug') slug: string) {
        return this.productsService.findPublicProductDetail(slug);
    }
}
