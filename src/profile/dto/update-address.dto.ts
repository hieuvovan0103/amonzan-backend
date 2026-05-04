import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAddressDto {
    @ApiPropertyOptional()
    @IsOptional() @IsString() recipient_name?: string;
    @ApiPropertyOptional()
    @IsOptional() @IsString() phone_number?: string;
    @ApiPropertyOptional()
    @IsOptional() @IsString() line1?: string;
    @ApiPropertyOptional()
    @IsOptional() @IsString() line2?: string;
    @ApiPropertyOptional()
    @IsOptional() @IsString() ward?: string;
    @ApiPropertyOptional()
    @IsOptional() @IsString() district?: string;
    @ApiPropertyOptional()
    @IsOptional() @IsString() city?: string;
    @ApiPropertyOptional()
    @IsOptional() @IsString() province?: string;
    @ApiPropertyOptional()
    @IsOptional() @IsString() postal_code?: string;
    @ApiPropertyOptional()
    @IsOptional() @IsString() country?: string;
    @ApiPropertyOptional()
    @IsOptional() @IsBoolean() is_default?: boolean;
}
