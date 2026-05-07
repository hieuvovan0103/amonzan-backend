import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RejectProductReviewDto {
  @ApiProperty({ example: 'Ảnh sản phẩm chưa rõ hoặc mô tả chưa đủ thông tin.' })
  @IsString()
  @MinLength(5)
  reason: string;
}
