export type PaymentStatusResponseDto = {
    orderId: string;
    orderStatus: string;
    paymentStatus: string;
    totalAmount: number;
};