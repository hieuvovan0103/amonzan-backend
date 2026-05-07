import { IsISO8601, IsUUID } from 'class-validator';

export class ProductAvailabilityQueryDto {
    @IsUUID()
    variantId: string;

    @IsISO8601()
    start: string;

    @IsISO8601()
    end: string;
}
