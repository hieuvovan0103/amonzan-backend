export const NotificationTypes = {
    OrderCreated: "ORDER_CREATED",
    OrderPaid: "ORDER_PAID",
    PaymentFailed: "PAYMENT_FAILED",
    OrderConfirmed: "ORDER_CONFIRMED",
    OrderCancelled: "ORDER_CANCELLED",
    OrderRenterConfirmedReceived: "ORDER_RENTER_CONFIRMED_RECEIVED",
    EarlyReturnRequested: "EARLY_RETURN_REQUESTED",
    EarlyReturnApproved: "EARLY_RETURN_APPROVED",
    EarlyReturnRejected: "EARLY_RETURN_REJECTED",
    EarlyReturnReceived: "EARLY_RETURN_RECEIVED",
    OrderCompleted: "ORDER_COMPLETED",
} as const;

export type OrderNotificationType =
    (typeof NotificationTypes)[keyof typeof NotificationTypes];
