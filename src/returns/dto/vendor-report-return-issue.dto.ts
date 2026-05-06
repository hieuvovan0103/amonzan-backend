import {
    ArrayMaxSize,
    IsArray,
    IsNumber,
    IsOptional,
    IsString,
    IsUrl,
    Max,
    MaxLength,
    Min,
} from "class-validator";

export class VendorReportReturnIssueDto {
    @IsString()
    @MaxLength(255)
    issueReason!: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    issueDescription?: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(100000000)
    damageFee?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(100000000)
    lateFee?: number;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(6)
    @IsUrl({}, { each: true })
    evidenceUrls?: string[];
}
