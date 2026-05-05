export type CreateOrderResponseDto = {
    orderId: string;
    paymentTransactionId: string;
    orderStatus: string;
    paymentStatus: string;
    subtotal: number;
    depositAmount: number;
    shippingFee: number;
    discountAmount: number;
    totalAmount: number;
};