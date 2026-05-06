import { IsDateString, IsOptional, IsString, MaxLength } from "class-validator";

export class ConfirmReturnReceivedDto {
    @IsOptional()
    @IsDateString()
    returnedAt?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    returnConditionNote?: string;

    @IsOptional()
    damaged?: boolean;
}
