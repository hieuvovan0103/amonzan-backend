export type MyOrderItemDto = {
    orderItemId: string;
    variantId: string;
    productId: string | null;
    productSlug: string | null;
    productName: string;
    productImage: string | null;
    variantName: string | null;
    quantity: number;
    unitPricePerDay: number;
    lineSubtotal: number;
    lineDeposit: number;
};

export type MyOrderDto = {
    orderId: string;
    status: string;
    paymentStatus: string;
    rentalStart: string;
    rentalEnd: string;
    subtotal: number;
    depositAmount: number;
    shippingFee: number;
    discountAmount: number;
    totalAmount: number;
    note: string | null;
    createdAt: string;
    confirmedAt: string | null;
    completedAt: string | null;
    address: {
        recipientName: string;
        phoneNumber: string;
        fullAddress: string;
    } | null;
    payment: {
        transactionId: string;
        method: string;
        amount: number;
        status: string;
        paidAt: string | null;
        provider: string | null;
    } | null;
    items: MyOrderItemDto[];
};

export type MyOrdersResponseDto = {
    orders: MyOrderDto[];
};