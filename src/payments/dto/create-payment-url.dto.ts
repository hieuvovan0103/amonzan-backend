import { IsUUID } from "class-validator";

export class CreatePaymentUrlDto {
    @IsUUID()
    orderId: string;
}