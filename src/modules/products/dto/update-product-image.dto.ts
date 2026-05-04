import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';

export class UpdateProductImageDto {
    @ApiPropertyOptional({ example: 'https://example.com/product.jpg' })
    @IsOptional()
    @IsString()
    @IsUrl()
    image_url?: string;

    @ApiPropertyOptional({ minimum: 0 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    sort_order?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    is_primary?: boolean;
}
