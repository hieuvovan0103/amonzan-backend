import { IsString, MaxLength, MinLength } from "class-validator";

export class ResolveReturnDisputeDto {
    @IsString()
    @MinLength(5)
    @MaxLength(2000)
    resolution!: string;
}
