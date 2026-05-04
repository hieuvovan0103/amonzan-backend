import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateProductVariantDto {
    @ApiProperty({ example: 'COSPLAY-001' })
    @IsString()
    sku: string;

    @ApiProperty({ example: 'Size M' })
    @IsString()
    variant_name: string;

    @ApiProperty({ minimum: 0, example: 120000 })
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    base_daily_rate: number;

    @ApiPropertyOptional({ minimum: 0, example: 700000 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    base_weekly_rate?: number;

    @ApiPropertyOptional({ minimum: 0, example: 300000 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    deposit_requirement?: number;

    @ApiPropertyOptional({ enum: ['NEW', 'GOOD', 'FAIR', 'DAMAGED'], default: 'NEW' })
    @IsOptional()
    @IsIn(['NEW', 'GOOD', 'FAIR', 'DAMAGED'])
    condition?: 'NEW' | 'GOOD' | 'FAIR' | 'DAMAGED';

    @ApiProperty({ minimum: 0, example: 3 })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    total_stock: number;

    @ApiProperty({ minimum: 0, example: 3 })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    available_stock: number;
}
