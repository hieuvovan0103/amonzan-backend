import { IsIn, IsOptional, IsString } from "class-validator";

export class ListDisputesQueryDto {
    @IsOptional()
    @IsIn(["ALL", "OPEN", "UNDER_REVIEW", "NEED_MORE_EVIDENCE", "RESOLVED", "REJECTED"])
    status?: string;

    @IsOptional()
    @IsString()
    page?: string;

    @IsOptional()
    @IsString()
    limit?: string;
}
