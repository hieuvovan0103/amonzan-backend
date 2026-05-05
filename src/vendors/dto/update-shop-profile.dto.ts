import { IsEmail, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateShopProfileDto {
  @ApiPropertyOptional({ description: 'Tên gian hàng' })
  @IsString()
  @IsOptional()
  shopName?: string;

  @ApiPropertyOptional({ description: 'Mô tả gian hàng' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Số điện thoại liên hệ' })
  @IsString()
  @IsOptional()
  contactPhone?: string;

  @ApiPropertyOptional({ description: 'Email hỗ trợ' })
  @IsEmail()
  @IsOptional()
  contactEmail?: string;

  @ApiPropertyOptional({ description: 'Tỉnh / Thành phố' })
  @IsString()
  @IsOptional()
  province?: string;

  @ApiPropertyOptional({ description: 'Quận / Huyện' })
  @IsString()
  @IsOptional()
  district?: string;

  @ApiPropertyOptional({ description: 'Địa chỉ chi tiết' })
  @IsString()
  @IsOptional()
  addressDetail?: string;

  @ApiPropertyOptional({ description: 'URL logo / avatar cửa hàng' })
  @IsString()
  @IsOptional()
  logoUrl?: string;
}
