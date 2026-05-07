import { IsDateString, IsOptional, IsString, MaxLength } from "class-validator";

export class VendorConfirmReturnDto {
    @IsOptional()
    @IsDateString()
    returnedAt?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    note?: string;
}
