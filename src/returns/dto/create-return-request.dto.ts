import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsOptional,
    IsString,
    IsUrl,
    MaxLength,
} from "class-validator";

export class CreateReturnRequestDto {
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    note?: string;

    @IsOptional()
    @IsIn(["NEW", "LIKE_NEW", "GOOD", "FAIR", "DAMAGED"])
    conditionStatus?: string;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(6)
    @IsUrl({}, { each: true })
    evidenceUrls?: string[];
}
