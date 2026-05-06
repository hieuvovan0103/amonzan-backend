import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../../auth/guards/supabase-auth.guard';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('categories')
@Controller()
export class CategoriesController {
    constructor(private readonly categoriesService: CategoriesService) { }

    @Get('categories')
    @ApiOperation({ summary: 'List all product categories.' })
    @ApiResponse({ status: 200, description: 'Category list ordered by name.' })
    findAll() {
        return this.categoriesService.findAll();
    }

    @Get('admin/categories')
    @UseGuards(SupabaseAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Admin list all categories.' })
    @ApiResponse({ status: 200, description: 'Admin category list.' })
    findAllForAdmin(@CurrentUser() user: any) {
        return this.categoriesService.findAllForAdmin(user.id);
    }

    @Post('admin/categories')
    @UseGuards(SupabaseAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Admin create a category.' })
    @ApiResponse({ status: 201, description: 'Category created.' })
    create(@CurrentUser() user: any, @Body() dto: CreateCategoryDto) {
        return this.categoriesService.create(user.id, dto);
    }

    @Patch('admin/categories/:id')
    @UseGuards(SupabaseAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Admin update a category.' })
    @ApiResponse({ status: 200, description: 'Category updated.' })
    update(
        @CurrentUser() user: any,
        @Param('id') categoryId: string,
        @Body() dto: UpdateCategoryDto,
    ) {
        return this.categoriesService.update(user.id, categoryId, dto);
    }

    @Delete('admin/categories/:id')
    @UseGuards(SupabaseAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Admin soft delete a category.' })
    @ApiResponse({ status: 200, description: 'Category disabled.' })
    softDelete(@CurrentUser() user: any, @Param('id') categoryId: string) {
        return this.categoriesService.softDelete(user.id, categoryId);
    }
}
