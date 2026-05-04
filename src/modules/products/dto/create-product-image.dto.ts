import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';

export class CreateProductImageDto {
    @ApiProperty({ example: 'https://example.com/product.jpg' })
    @IsString()
    @IsUrl()
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
