import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";
import { VnpayProvider } from "./providers/vnpay.provider";
import type { PaymentStatusResponseDto } from "./dto/payment-status-response.dto";

@Injectable()
export class PaymentsService {
    private readonly vnpayProvider = new VnpayProvider();

    constructor(private readonly supabaseService: SupabaseService) { }

    async createVnpayPaymentUrl(orderId: string, ipAddress: string) {
        const supabase = this.supabaseService.client;

        const { data: order, error: orderError } = await supabase
            .from("rental_orders")
            .select("order_id, status, payment_status, total_amount")
            .eq("order_id", orderId)
            .single();

        if (orderError || !order) {
            throw new NotFoundException("Không tìm thấy đơn thuê");
        }

        if (order.status !== "PENDING_PAYMENT") {
            throw new BadRequestException(
                "Đơn thuê không ở trạng thái chờ thanh toán"
            );
        }

        if (order.payment_status !== "UNPAID") {
            throw new BadRequestException(
                "Đơn thuê này không còn ở trạng thái chưa thanh toán"
            );
        }

        const amount = Number(order.total_amount || 0);

        if (amount <= 0) {
            throw new BadRequestException("Số tiền thanh toán không hợp lệ");
        }

        const paymentUrlResult = this.vnpayProvider.createPaymentUrl({
            orderId: order.order_id,
            amount,
            ipAddress,
        });

        const { error: updatePaymentError } = await supabase
            .from("payment_transactions")
            .update({
                provider: "VNPAY",
                provider_order_id: paymentUrlResult.providerOrderId,
                payment_url: paymentUrlResult.paymentUrl,
                raw_response: {
                    created_at: new Date().toISOString(),
                    vnp_params: paymentUrlResult.rawParams,
                },
            })
            .eq("order_id", order.order_id)
            .eq("status", "UNPAID");

        if (updatePaymentError) {
            throw new BadRequestException(
                `Không thể cập nhật giao dịch thanh toán: ${updatePaymentError.message}`
            );
        }

        return {
            orderId: order.order_id,
            provider: "VNPAY",
            paymentUrl: paymentUrlResult.paymentUrl,
        };
    }

    async handleVnpayIpn(query: Record<string, any>) {
        const supabase = this.supabaseService.client;

        const verified = this.vnpayProvider.verifyReturn(query);

        if (!verified.isValidSignature) {
            return {
                RspCode: "97",
                Message: "Invalid signature",
            };
        }

        if (!verified.providerOrderId) {
            return {
                RspCode: "01",
                Message: "Order not found",
            };
        }

        const { data: payment, error: paymentError } = await supabase
            .from("payment_transactions")
            .select(
                `
        transaction_id,
        order_id,
        amount,
        status,
        provider_order_id
      `
            )
            .eq("provider_order_id", verified.providerOrderId)
            .single();

        if (paymentError || !payment) {
            return {
                RspCode: "01",
                Message: "Order not found",
            };
        }

        if (Number(payment.amount) !== Number(verified.amount)) {
            await supabase
                .from("payment_transactions")
                .update({
                    raw_ipn: verified.rawData,
                    failed_reason: "Số tiền VNPAY trả về không khớp với đơn hàng",
                })
                .eq("transaction_id", payment.transaction_id);

            return {
                RspCode: "04",
                Message: "Invalid amount",
            };
        }

        if (payment.status === "PAID") {
            return {
                RspCode: "02",
                Message: "Order already confirmed",
            };
        }

        if (!verified.isSuccess) {
            await supabase
                .from("payment_transactions")
                .update({
                    status: "FAILED",
                    provider_transaction_id: verified.providerTransactionId,
                    raw_ipn: verified.rawData,
                    failed_reason: `VNPAY failed: responseCode=${verified.responseCode}, transactionStatus=${verified.transactionStatus}`,
                })
                .eq("transaction_id", payment.transaction_id);

            await supabase
                .from("rental_orders")
                .update({
                    payment_status: "FAILED",
                })
                .eq("order_id", payment.order_id);

            return {
                RspCode: "00",
                Message: "Confirm failed payment success",
            };
        }

        const confirmResult = await this.confirmSuccessfulPayment(
            payment,
            verified.providerTransactionId,
            { raw_ipn: verified.rawData },
        );

        if (!confirmResult.ok) {
            return {
                RspCode: "99",
                Message: confirmResult.message,
            };
        }

        return {
            RspCode: "00",
            Message: "Confirm success",
        };
    }

    async verifyVnpayReturn(query: Record<string, any>) {
        const verified = this.vnpayProvider.verifyReturn(query);

        if (!verified.isValidSignature) {
            return {
                success: false,
                orderId: null,
                paymentStatus: "UNKNOWN",
                reason: "Sai chữ ký trả về từ VNPAY",
            };
        }

        if (!verified.providerOrderId) {
            return {
                success: false,
                orderId: null,
                paymentStatus: "UNKNOWN",
                reason: "Không tìm thấy mã giao dịch VNPAY",
            };
        }

        const supabase = this.supabaseService.client;

        const { data: payment } = await supabase
            .from("payment_transactions")
            .select("transaction_id, order_id, amount, status, provider_order_id")
            .eq("provider_order_id", verified.providerOrderId)
            .single();

        if (!payment) {
            return {
                success: false,
                orderId: null,
                paymentStatus: "UNKNOWN",
                reason: "Không tìm thấy giao dịch thanh toán",
            };
        }

        if (Number(payment.amount) !== Number(verified.amount)) {
            await supabase
                .from("payment_transactions")
                .update({
                    raw_response: verified.rawData,
                    failed_reason: "Số tiền VNPAY trả về không khớp với đơn hàng",
                })
                .eq("transaction_id", payment.transaction_id);

            return {
                success: false,
                orderId: payment.order_id,
                paymentStatus: payment.status || "PENDING",
                reason: "Số tiền VNPAY trả về không khớp với đơn hàng",
            };
        }

        if (verified.isSuccess && payment.status !== "PAID") {
            const confirmResult = await this.confirmSuccessfulPayment(
                payment,
                verified.providerTransactionId,
                { raw_response: verified.rawData },
            );

            if (!confirmResult.ok) {
                return {
                    success: false,
                    orderId: payment.order_id,
                    paymentStatus: payment.status || "PENDING",
                    reason: confirmResult.message,
                };
            }
        }

        return {
            success: verified.isSuccess,
            orderId: payment.order_id,
            paymentStatus: verified.isSuccess ? "PAID" : payment.status || "PENDING",
            reason: verified.isSuccess
                ? null
                : `VNPAY responseCode=${verified.responseCode}, transactionStatus=${verified.transactionStatus}`,
        };
    }

    async getPaymentStatus(orderId: string): Promise<PaymentStatusResponseDto> {
        const supabase = this.supabaseService.client;

        const { data: order, error } = await supabase
            .from("rental_orders")
            .select("order_id, status, payment_status, total_amount")
            .eq("order_id", orderId)
            .single();

        if (error || !order) {
            throw new NotFoundException("Không tìm thấy đơn thuê");
        }

        return {
            orderId: order.order_id,
            orderStatus: order.status,
            paymentStatus: order.payment_status,
            totalAmount: Number(order.total_amount || 0),
        };
    }

    private async confirmSuccessfulPayment(
        payment: {
            transaction_id: string;
            order_id: string;
            status: string;
        },
        providerTransactionId: string | null,
        rawData: { raw_ipn?: any; raw_response?: any },
    ) {
        const supabase = this.supabaseService.client;

        if (payment.status === "PAID") {
            return {
                ok: true,
                message: "Order already confirmed",
            };
        }

        const stockResult = await this.decreaseStockAfterPayment(payment.order_id);

        if (!stockResult.ok) {
            await supabase
                .from("payment_transactions")
                .update({
                    ...rawData,
                    failed_reason: stockResult.message,
                })
                .eq("transaction_id", payment.transaction_id);

            return stockResult;
        }

        const { error: updatePaymentError } = await supabase
            .from("payment_transactions")
            .update({
                status: "PAID",
                paid_at: new Date().toISOString(),
                provider_transaction_id: providerTransactionId,
                ...rawData,
            })
            .eq("transaction_id", payment.transaction_id);

        if (updatePaymentError) {
            return {
                ok: false,
                message: "Cannot update payment",
            };
        }

        const { error: updateOrderError } = await supabase
            .from("rental_orders")
            .update({
                payment_status: "PAID",
                status: "PENDING_VENDOR_APPROVAL",
            })
            .eq("order_id", payment.order_id);

        if (updateOrderError) {
            return {
                ok: false,
                message: "Cannot update order",
            };
        }

        return {
            ok: true,
            message: "Confirm success",
        };
    }

    private async decreaseStockAfterPayment(orderId: string) {
        const supabase = this.supabaseService.client;

        const { data: items, error: itemsError } = await supabase
            .from("rental_order_items")
            .select("variant_id, quantity")
            .eq("order_id", orderId);

        if (itemsError || !items) {
            return {
                ok: false,
                message: "Không thể lấy danh sách sản phẩm trong đơn",
            };
        }

        for (const item of items) {
            const { data: variant, error: variantError } = await supabase
                .from("product_variants")
                .select("variant_id, available_stock")
                .eq("variant_id", item.variant_id)
                .single();

            if (variantError || !variant) {
                return {
                    ok: false,
                    message: `Không tìm thấy biến thể sản phẩm ${item.variant_id}`,
                };
            }

            const nextStock =
                Number(variant.available_stock || 0) - Number(item.quantity || 0);

            if (nextStock < 0) {
                return {
                    ok: false,
                    message: `Biến thể ${item.variant_id} không còn đủ tồn kho`,
                };
            }

            const { error: updateStockError } = await supabase
                .from("product_variants")
                .update({
                    available_stock: nextStock,
                })
                .eq("variant_id", item.variant_id);

            if (updateStockError) {
                return {
                    ok: false,
                    message: `Không thể cập nhật tồn kho cho ${item.variant_id}`,
                };
            }
        }

        return {
            ok: true,
            message: "OK",
        };
    }
}
