import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAddressDto {
    @ApiProperty()
    @IsNotEmpty() @IsString() recipient_name: string;
    @ApiProperty()
    @IsNotEmpty() @IsString() phone_number: string;
    @ApiProperty()
    @IsNotEmpty() @IsString() line1: string;
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
    @ApiPropertyOptional({ default: 'VN' })
    @IsOptional() @IsString() country?: string;
    @ApiPropertyOptional({ default: false })
    @IsOptional() @IsBoolean() is_default?: boolean;
}
