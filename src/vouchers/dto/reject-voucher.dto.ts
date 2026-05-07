import { IsString, MinLength } from "class-validator";

export class RejectVoucherDto {
    @IsString()
    @MinLength(3)
    reason: string;
}

