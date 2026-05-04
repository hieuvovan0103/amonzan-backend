import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateProductVariantDto {
    @ApiPropertyOptional({ example: 'COSPLAY-001' })
    @IsOptional()
    @IsString()
    sku?: string;

    @ApiPropertyOptional({ example: 'Size M' })
    @IsOptional()
    @IsString()
    variant_name?: string;

    @ApiPropertyOptional({ minimum: 0 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    base_daily_rate?: number;

    @ApiPropertyOptional({ minimum: 0 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    base_weekly_rate?: number;

    @ApiPropertyOptional({ minimum: 0 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    deposit_requirement?: number;

    @ApiPropertyOptional({ enum: ['NEW', 'GOOD', 'FAIR', 'DAMAGED'] })
    @IsOptional()
    @IsIn(['NEW', 'GOOD', 'FAIR', 'DAMAGED'])
    condition?: 'NEW' | 'GOOD' | 'FAIR' | 'DAMAGED';

    @ApiPropertyOptional({ minimum: 0 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    total_stock?: number;

    @ApiPropertyOptional({ minimum: 0 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    available_stock?: number;
}
