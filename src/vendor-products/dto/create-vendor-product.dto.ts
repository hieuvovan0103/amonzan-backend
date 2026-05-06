import {
    IsBoolean,
    IsArray,
    IsIn,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Min,
    ValidateNested,
    ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class CreateProductImageDto {
    @ApiProperty({ example: 'https://example.com/product.jpg' })
    @IsString()
    image_url: string;

    @ApiPropertyOptional({ minimum: 0, default: 0 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    sort_order?: number;

    @ApiPropertyOptional({ default: false })
    @IsOptional()
    @IsBoolean()
    is_primary?: boolean;
}

class CreateProductVariantDto {
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

    @ApiPropertyOptional({ enum: ['NEW', 'GOOD', 'FAIR', 'DAMAGED'], default: 'NEW' })
    @IsOptional()
    @IsIn(['NEW', 'GOOD', 'FAIR', 'DAMAGED'])
    condition?: 'NEW' | 'GOOD' | 'FAIR' | 'DAMAGED';

    @ApiProperty({ minimum: 1, example: 3 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    total_stock: number;
}

export class CreateVendorProductDto {
    @ApiProperty({ example: 'Armin Attack on Titan Cosplay' })
    @IsString()
    name: string;

    @ApiProperty({ example: 'armin-attack-on-titan-cosplay' })
    @IsString()
    slug: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ format: 'uuid' })
    @IsUUID()
    category_id: string;

    @ApiProperty({ type: [CreateProductImageDto] })
    @IsArray()
    @ArrayMinSize(1, { message: 'Vui lòng tải lên ít nhất một ảnh sản phẩm.' })
    @ValidateNested({ each: true })
    @Type(() => CreateProductImageDto)
    images: CreateProductImageDto[];

    @ApiProperty({ type: [CreateProductVariantDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateProductVariantDto)
    variants: CreateProductVariantDto[];
}
