import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationQueryDto {
    @ApiPropertyOptional({ default: 1, minimum: 1, description: 'Page number.' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1, { message: 'Trang phải lớn hơn hoặc bằng 1.' })
    page?: number = 1;

    @ApiPropertyOptional({ default: 12, minimum: 1, maximum: 50, description: 'Items per page.' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1, { message: 'Số lượng mỗi trang phải lớn hơn hoặc bằng 1.' })
    @Max(50, { message: 'Số lượng mỗi trang không được vượt quá 50.' })
    limit?: number = 12;
}
