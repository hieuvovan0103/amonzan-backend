import {
    ArrayMinSize,
    IsArray,
    IsInt,
    IsISO8601,
    IsOptional,
    IsString,
    IsUUID,
    Min,
    ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateOrderItemDto {
    @IsUUID()
    variantId: string;

    @IsInt()
    @Min(1)
    quantity: number;

    @IsISO8601()
    rentalStart: string;

    @IsISO8601()
    rentalEnd: string;
}

export class CreateOrderDto {
    @IsUUID()
    addressId: string;

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => CreateOrderItemDto)
    items: CreateOrderItemDto[];

    @IsOptional()
    @IsString()
    voucherCode?: string;

    @IsOptional()
    @IsString()
    note?: string;
}
