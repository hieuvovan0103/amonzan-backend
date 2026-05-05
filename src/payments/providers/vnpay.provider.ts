import * as crypto from "crypto";
import type {
    CreatePaymentUrlInput,
    CreatePaymentUrlResult,
    PaymentProvider,
    VerifyReturnResult,
} from "../payment-provider.interface";

function formatVnpayDate(date: Date) {
    const pad = (value: number) => String(value).padStart(2, "0");

    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hour = pad(date.getHours());
    const minute = pad(date.getMinutes());
    const second = pad(date.getSeconds());

    return `${year}${month}${day}${hour}${minute}${second}`;
}

function sortObject(params: Record<string, any>) {
    const sorted: Record<string, any> = {};

    Object.keys(params)
        .sort()
        .forEach((key) => {
            const value = params[key];

            if (value !== undefined && value !== null && value !== "") {
                sorted[key] = value;
            }
        });

    return sorted;
}

function encodeValue(value: string | number) {
    return encodeURIComponent(String(value)).replace(/%20/g, "+");
}

function buildQueryString(params: Record<string, any>) {
    return Object.keys(params)
        .map((key) => `${encodeURIComponent(key)}=${encodeValue(params[key])}`)
        .join("&");
}

function createSecureHash(params: Record<string, any>, hashSecret: string) {
    const sortedParams = sortObject(params);
    const signData = buildQueryString(sortedParams);

    return crypto
        .createHmac("sha512", hashSecret)
        .update(Buffer.from(signData, "utf-8"))
        .digest("hex");
}

export class VnpayProvider implements PaymentProvider {
    private readonly tmnCode = process.env.VNPAY_TMN_CODE || "";
    private readonly hashSecret = process.env.VNPAY_HASH_SECRET || "";
    private readonly paymentUrl =
        process.env.VNPAY_PAYMENT_URL ||
        "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
    private readonly returnUrl = process.env.VNPAY_RETURN_URL || "";

    createPaymentUrl(input: CreatePaymentUrlInput): CreatePaymentUrlResult {
        this.validateConfig();

        const now = new Date();
        const providerOrderId = this.createProviderOrderId(input.orderId);

        const vnpParams: Record<string, string | number> = {
            vnp_Version: "2.1.0",
            vnp_Command: "pay",
            vnp_TmnCode: this.tmnCode,
            vnp_Amount: Math.round(input.amount * 100),
            vnp_CurrCode: "VND",
            vnp_TxnRef: providerOrderId,
            vnp_OrderInfo:
                input.orderInfo || `Thanh toan don thue Amonzan ${input.orderId}`,
            vnp_OrderType: "other",
            vnp_Locale: "vn",
            vnp_ReturnUrl: this.returnUrl,
            vnp_IpAddr: input.ipAddress || "127.0.0.1",
            vnp_CreateDate: formatVnpayDate(now),
        };

        const secureHash = createSecureHash(vnpParams, this.hashSecret);

        const finalParams = {
            ...vnpParams,
            vnp_SecureHash: secureHash,
        };

        return {
            provider: "VNPAY",
            providerOrderId,
            paymentUrl: `${this.paymentUrl}?${buildQueryString(finalParams)}`,
            rawParams: vnpParams,
        };
    }

    verifyReturn(query: Record<string, any>): VerifyReturnResult {
        this.validateConfig();

        const secureHash = query.vnp_SecureHash;

        const paramsToSign = { ...query };
        delete paramsToSign.vnp_SecureHash;
        delete paramsToSign.vnp_SecureHashType;

        const calculatedHash = createSecureHash(paramsToSign, this.hashSecret);

        const isValidSignature =
            String(calculatedHash).toLowerCase() ===
            String(secureHash || "").toLowerCase();

        const responseCode = query.vnp_ResponseCode || null;
        const transactionStatus = query.vnp_TransactionStatus || null;

        return {
            isValidSignature,
            isSuccess: responseCode === "00" && transactionStatus === "00",
            providerOrderId: query.vnp_TxnRef || null,
            providerTransactionId: query.vnp_TransactionNo || null,
            amount: Number(query.vnp_Amount || 0) / 100,
            responseCode,
            transactionStatus,
            rawData: query,
        };
    }

    private validateConfig() {
        if (!this.tmnCode) {
            throw new Error("Missing VNPAY_TMN_CODE in env");
        }

        if (!this.hashSecret) {
            throw new Error("Missing VNPAY_HASH_SECRET in env");
        }

        if (!this.paymentUrl) {
            throw new Error("Missing VNPAY_PAYMENT_URL in env");
        }

        if (!this.returnUrl) {
            throw new Error("Missing VNPAY_RETURN_URL in env");
        }
    }

    private createProviderOrderId(orderId: string) {
        const compactOrderId = orderId.replaceAll("-", "").slice(0, 20);
        return `AMZ${Date.now()}${compactOrderId}`;
    }
}
