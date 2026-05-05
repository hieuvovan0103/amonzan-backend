export type CreatePaymentUrlInput = {
    orderId: string;
    amount: number;
    ipAddress: string;
    orderInfo?: string;
};

export type CreatePaymentUrlResult = {
    provider: string;
    providerOrderId: string;
    paymentUrl: string;
    rawParams: Record<string, string | number>;
};

export type VerifyReturnResult = {
    isValidSignature: boolean;
    isSuccess: boolean;
    providerOrderId: string | null;
    providerTransactionId: string | null;
    amount: number;
    responseCode: string | null;
    transactionStatus: string | null;
    rawData: Record<string, any>;
};

export interface PaymentProvider {
    createPaymentUrl(input: CreatePaymentUrlInput): CreatePaymentUrlResult;

    verifyReturn(query: Record<string, any>): VerifyReturnResult;
}