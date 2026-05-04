import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateVendorProductDto {
    @ApiPropertyOptional()
    name?: string;
    @ApiPropertyOptional()
    slug?: string;
    @ApiPropertyOptional()
    description?: string;
    @ApiPropertyOptional({ format: 'uuid', nullable: true })
    category_id?: string | null;
    @ApiPropertyOptional({ enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'] })
    status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
}
