import {
    ArrayMaxSize,
    IsArray,
    IsDateString,
    IsOptional,
    IsString,
    IsUrl,
    MaxLength,
} from "class-validator";

export class EarlyReturnRequestDto {
    @IsDateString()
    requestedReturnAt!: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    reason?: string;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(6)
    @IsUrl({}, { each: true })
    conditionImageUrls?: string[];
}
