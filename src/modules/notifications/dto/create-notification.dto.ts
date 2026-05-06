import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateNotificationDto {
    @IsUUID()
    userId!: string;

    @IsString()
    type!: string;

    @IsString()
    @MaxLength(500)
    title!: string;

    @IsOptional()
    @IsString()
    content?: string;

    @IsOptional()
    @IsString()
    actionUrl?: string;

    @IsOptional()
    @IsString()
    relatedType?: string;

    @IsOptional()
    @IsUUID()
    relatedId?: string;
}
