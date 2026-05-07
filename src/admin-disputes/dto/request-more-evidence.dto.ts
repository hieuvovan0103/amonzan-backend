import { IsIn, IsString, MaxLength, MinLength } from "class-validator";

export class RequestMoreEvidenceDto {
    @IsIn(["RENTER", "VENDOR", "BOTH"])
    target!: "RENTER" | "VENDOR" | "BOTH";

    @IsString()
    @MinLength(5)
    @MaxLength(1000)
    message!: string;
}
