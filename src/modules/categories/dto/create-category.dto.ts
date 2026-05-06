import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateCategoryDto {
    @ApiProperty({ example: 'Trang phục' })
    @IsString()
    @MaxLength(255)
    name: string;

    @ApiProperty({ example: 'trang-phuc' })
    @IsString()
    @MaxLength(255)
    @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    slug: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ default: true })
    @IsOptional()
    @IsBoolean()
    is_active?: boolean;
}
