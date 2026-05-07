import {
    ArrayMaxSize,
    IsArray,
    IsOptional,
    IsString,
    IsUrl,
    MaxLength,
} from "class-validator";

export class CreateReturnComplaintDto {
    @IsString()
    @MaxLength(500)
    title!: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(6)
    @IsUrl({}, { each: true })
    evidenceUrls?: string[];
}
