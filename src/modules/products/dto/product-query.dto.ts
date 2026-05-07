import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ProductQueryDto extends PaginationQueryDto {
    @ApiPropertyOptional({ description: 'Search keyword matched against product name or description.' })
    @IsOptional()
    @IsString()
    keyword?: string;

    @ApiPropertyOptional({ description: 'Alias for keyword.' })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ format: 'uuid', description: 'Filter by category id.' })
    @IsOptional()
    @IsUUID()
    categoryId?: string;

    @ApiPropertyOptional({ description: 'Filter by category slug.' })
    @IsOptional()
    @IsString()
    categorySlug?: string;

    @ApiPropertyOptional({ description: 'Filter by category slug. Alias for categorySlug.' })
    @IsOptional()
    @IsString()
    category?: string;

    @ApiPropertyOptional({ minimum: 0, description: 'Minimum daily rental price.' })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    minPrice?: number;

    @ApiPropertyOptional({ minimum: 0, description: 'Maximum daily rental price.' })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    maxPrice?: number;

    @ApiPropertyOptional({ enum: ['NEW', 'GOOD', 'FAIR', 'DAMAGED'], description: 'Filter by variant condition.' })
    @IsOptional()
    @IsIn(['NEW', 'GOOD', 'FAIR', 'DAMAGED'])
    condition?: string;

    @ApiPropertyOptional({ description: 'Filter by shop province.' })
    @IsOptional()
    @IsString()
    province?: string;

    @ApiPropertyOptional({ enum: ['newest', 'price_asc', 'price_desc', 'rating_desc'], default: 'newest' })
    @IsOptional()
    @IsIn(['newest', 'price_asc', 'price_desc', 'rating_desc'])
    sort?: 'newest' | 'price_asc' | 'price_desc' | 'rating_desc' = 'newest';
}
