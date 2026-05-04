import { IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
    @ApiPropertyOptional()
    @IsOptional() @IsString() full_name?: string;
    @ApiPropertyOptional()
    @IsOptional() @IsString() email?: string;
    @ApiPropertyOptional()
    @IsOptional() @IsString() phone_number?: string;
    @ApiPropertyOptional()
    @IsOptional() @IsString() gender?: string;
    @ApiPropertyOptional()
    @IsOptional() @IsString() id_number?: string;
    @ApiPropertyOptional()
    @IsOptional() @IsString() avatar_url?: string;
    @ApiPropertyOptional({ format: 'date' })
    @IsOptional() @IsDateString() date_of_birth?: string;
}
