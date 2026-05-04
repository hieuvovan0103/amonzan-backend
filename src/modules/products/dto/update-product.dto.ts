import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpdateProductDto {
    @ApiPropertyOptional({ minLength: 2, maxLength: 150 })
    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(150)
    name?: string;

    @ApiPropertyOptional({ format: 'uuid', nullable: true })
    @IsOptional()
    @IsUUID()
    category_id?: string | null;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;
}
