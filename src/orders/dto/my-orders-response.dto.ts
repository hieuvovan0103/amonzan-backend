export type MyOrderItemDto = {
    orderItemId: string;
    variantId: string;
    productId: string | null;
    productSlug: string | null;
    productName: string;
    productImage: string | null;
    variantName: string | null;
    shopName: string | null;
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
    earlyReturnRequest: {
        requestId: string;
        orderId: string;
        requestedReturnAt: string;
        originalRentalEnd: string;
        reason: string | null;
        status: string;
        vendorResponseNote: string | null;
        estimatedRefundAmount: number;
        conditionImageUrls: string[];
        approvedAt: string | null;
        rejectedAt: string | null;
        receivedAt: string | null;
        returnConditionNote: string | null;
        createdAt: string;
    } | null;
    returnRecord: {
        recordId: string;
        returnRequestedAt: string | null;
        returnRequestNote: string | null;
        returnConditionStatus: string | null;
        returnEvidenceUrls: string[];
        returnedAt: string | null;
        returnConditionNote: string | null;
        vendorReturnStatus: string;
        vendorReturnNote: string | null;
        returnIssueReason: string | null;
        returnIssueDescription: string | null;
        returnIssueEvidenceUrls: string[];
        updatedAt: string | null;
    } | null;
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
