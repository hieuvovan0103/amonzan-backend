import {
    Body,
    Controller,
    Get,
    Ip,
    Param,
    Post,
    Query,
    Req,
} from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { CreatePaymentUrlDto } from "./dto/create-payment-url.dto";

@Controller("payments")
export class PaymentsController {
    constructor(private readonly paymentsService: PaymentsService) { }

    @Post("vnpay/create-payment-url")
    createVnpayPaymentUrl(
        @Body() dto: CreatePaymentUrlDto,
        @Ip() ip: string,
        @Req() req: any
    ) {
        const forwardedFor = req.headers["x-forwarded-for"];

        const clientIp =
            typeof forwardedFor === "string"
                ? forwardedFor.split(",")[0].trim()
                : ip;

        return this.paymentsService.createVnpayPaymentUrl(
            dto.orderId,
            clientIp || "127.0.0.1"
        );
    }

    @Get("vnpay/ipn")
    handleVnpayIpn(@Query() query: Record<string, any>) {
        return this.paymentsService.handleVnpayIpn(query);
    }

    @Get("vnpay/return")
    verifyVnpayReturn(@Query() query: Record<string, any>) {
        return this.paymentsService.verifyVnpayReturn(query);
    }

    @Get(":orderId/status")
    getPaymentStatus(@Param("orderId") orderId: string) {
        return this.paymentsService.getPaymentStatus(orderId);
    }
}