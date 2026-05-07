import {
    IsDateString,
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    Min,
} from "class-validator";

export class UpdateVoucherDto {
    @IsOptional()
    @IsString()
    code?: string;

    @IsOptional()
    @IsIn(["PERCENTAGE", "FIXED"])
    discountType?: "PERCENTAGE" | "FIXED";

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(100000000)
    discountValue?: number;

    @IsOptional()
    @IsDateString()
    validFrom?: string;

    @IsOptional()
    @IsDateString()
    validTo?: string;

    @IsOptional()
    @IsString()
    description?: string;
}

