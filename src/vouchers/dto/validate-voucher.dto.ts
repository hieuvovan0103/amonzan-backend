import { IsNumber, IsOptional, IsString, IsUUID, Min } from "class-validator";

export class ValidateVoucherDto {
    @IsString()
    code: string;

    @IsNumber()
    @Min(0)
    subtotal: number;

    @IsOptional()
    @IsUUID()
    shopId?: string;
}

