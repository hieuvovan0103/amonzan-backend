import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PartnerType {
  INDIVIDUAL = 'individual',
  BUSINESS = 'business',
}

export class RegisterVendorDto {
  @ApiProperty({ description: 'Tên gian hàng' })
  @IsString()
  @IsNotEmpty()
  shopName: string;

  @ApiProperty({ description: 'Số điện thoại liên hệ' })
  @IsString()
  @IsNotEmpty()
  contactPhone: string;

  @ApiProperty({ description: 'Email hỗ trợ' })
  @IsEmail()
  @IsNotEmpty()
  contactEmail: string;

  @ApiPropertyOptional({ description: 'Mô tả gian hàng' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Tỉnh / Thành phố' })
  @IsString()
  @IsNotEmpty()
  province: string;

  @ApiProperty({ description: 'Quận / Huyện' })
  @IsString()
  @IsNotEmpty()
  district: string;

  @ApiProperty({ description: 'Địa chỉ chi tiết' })
  @IsString()
  @IsNotEmpty()
  addressDetail: string;

  @ApiProperty({ enum: PartnerType, description: 'Loại hình đối tác' })
  @IsEnum(PartnerType)
  partnerType: PartnerType;

  @ApiProperty({ description: 'Số CCCD hoặc mã số doanh nghiệp' })
  @IsString()
  @IsNotEmpty()
  identityNumber: string;

  @ApiPropertyOptional({ description: 'URL mặt trước CCCD hoặc giấy phép kinh doanh' })
  @IsString()
  @IsOptional()
  identityFrontUrl?: string;

  @ApiPropertyOptional({ description: 'URL mặt sau CCCD hoặc giấy tờ bổ sung' })
  @IsString()
  @IsOptional()
  identityBackUrl?: string;
}
