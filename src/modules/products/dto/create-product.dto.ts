import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateProductDto {
    @ApiProperty({ minLength: 2, maxLength: 150, example: 'Armin Attack on Titan Cosplay' })
    @IsString()
    @MinLength(2)
    @MaxLength(150)
    name: string;

    @ApiPropertyOptional({ format: 'uuid' })
    @IsOptional()
    @IsUUID()
    category_id?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;
}
