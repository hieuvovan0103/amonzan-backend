import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";
import { Type } from "class-transformer";

export class ResolveDisputeDto {
    @IsIn([
        "FULL_REFUND",
        "PARTIAL_REFUND",
        "NO_REFUND",
        "RELEASE_TO_VENDOR",
        "DEDUCT_DEPOSIT",
        "REFUND_DEPOSIT",
        "SPLIT_AMOUNT",
    ])
    decision!:
        | "FULL_REFUND"
        | "PARTIAL_REFUND"
        | "NO_REFUND"
        | "RELEASE_TO_VENDOR"
        | "DEDUCT_DEPOSIT"
        | "REFUND_DEPOSIT"
        | "SPLIT_AMOUNT";

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    refundAmount?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    refund_amount?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    damageFee?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    damage_fee?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    lateFee?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    late_fee?: number;

    @IsString()
    @MinLength(5)
    @MaxLength(2000)
    resolution!: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    adminNote?: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    admin_note?: string;
}
