import {
    IsDateString,
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    Min,
} from "class-validator";

export class CreateVoucherDto {
    @IsString()
    code: string;

    @IsIn(["PERCENTAGE", "FIXED"])
    discountType: "PERCENTAGE" | "FIXED";

    @IsNumber()
    @Min(0)
    @Max(100000000)
    discountValue: number;

    @IsDateString()
    validFrom: string;

    @IsDateString()
    validTo: string;

    @IsOptional()
    @IsString()
    description?: string;
}

