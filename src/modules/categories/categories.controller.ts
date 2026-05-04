import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
    constructor(private readonly categoriesService: CategoriesService) { }

    @Get()
    @ApiOperation({ summary: 'List all product categories.' })
    @ApiResponse({ status: 200, description: 'Category list ordered by name.' })
    findAll() {
        return this.categoriesService.findAll();
    }
}
