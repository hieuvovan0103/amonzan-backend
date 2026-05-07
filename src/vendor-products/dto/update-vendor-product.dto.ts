import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateVendorProductDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    slug?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ format: 'uuid' })
    @IsOptional()
    @IsUUID()
    category_id?: string;

    @ApiPropertyOptional({ enum: ['DRAFT', 'ARCHIVED'] })
    @IsOptional()
    @IsIn(['DRAFT', 'ARCHIVED'])
    status?: 'DRAFT' | 'ARCHIVED';
}
