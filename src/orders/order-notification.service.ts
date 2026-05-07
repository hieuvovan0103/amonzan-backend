import { Injectable } from "@nestjs/common";
import { NotificationsService } from "../modules/notifications/notifications.service";
import { NotificationTypes, type OrderNotificationType } from "../modules/notifications/notification-types";
import { SupabaseService } from "../supabase/supabase.service";

type NotificationAudience = "RENTER" | "VENDOR";

type NotificationPayload = {
    type: string;
    title: string;
    content: string;
    actionUrl: string;
    relatedType: "ORDER";
    relatedId: string;
};

type OrderContext = {
    orderId: string;
    shortOrderId: string;
    renterUserId: string | null;
    vendorUserIds: string[];
    productName: string;
    shopName: string;
};

@Injectable()
export class OrderNotificationService {
    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly notificationsService: NotificationsService,
    ) {}

    async notifyOrderEvent(orderId: string, type: OrderNotificationType) {
        try {
            const context = await this.getOrderContext(orderId);
            if (!context) return;

            await Promise.all([
                this.notifyAudience(
                    context.renterUserId ? [context.renterUserId] : [],
                    this.buildPayload(type, "RENTER", context),
                ),
                this.notifyAudience(
                    context.vendorUserIds,
                    this.buildPayload(type, "VENDOR", context),
                ),
            ]);
        } catch (error: any) {
            // Notifications are best-effort; order/payment state changes should not fail after commit.
            console.warn(
                `[order-notifications] Unable to create ${type} notification for order ${orderId}:`,
                error?.message ?? error,
            );
        }
    }

    private async notifyAudience(userIds: string[], payload: NotificationPayload) {
        const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
        if (uniqueUserIds.length === 0) return;

        const freshUserIds = await this.filterAlreadyNotified(uniqueUserIds, payload);
        if (freshUserIds.length === 0) return;

        await this.notificationsService.notifyUsers(freshUserIds, payload);
    }

    private async filterAlreadyNotified(userIds: string[], payload: NotificationPayload) {
        const { data, error } = await this.supabaseService.client
            .from("notifications")
            .select("user_id")
            .in("user_id", userIds)
            .eq("type", payload.type)
            .eq("related_type", payload.relatedType)
            .eq("related_id", payload.relatedId);

        if (error) {
            return userIds;
        }

        const notifiedUserIds = new Set((data ?? []).map((item) => item.user_id as string));
        return userIds.filter((userId) => !notifiedUserIds.has(userId));
    }

    private async getOrderContext(orderId: string): Promise<OrderContext | null> {
        const { data: order, error } = await this.supabaseService.client
            .from("rental_orders")
            .select(
                `
                order_id,
                renter_profiles (
                    user_id
                ),
                rental_order_items (
                    product_variants (
                        products (
                            name,
                            shop_profiles (
                                user_id,
                                shop_name
                            )
                        )
                    )
                )
            `,
            )
            .eq("order_id", orderId)
            .single();

        if (error || !order) return null;

        const renterProfile = this.first(order.renter_profiles);
        const productContexts = (order.rental_order_items ?? []).flatMap((item: any) => {
            const variant = this.first(item.product_variants);
            const product = this.first(variant?.products);
            const shop = this.first(product?.shop_profiles);

            return product
                ? [{
                    productName: product.name as string | undefined,
                    shopName: shop?.shop_name as string | undefined,
                    vendorUserId: shop?.user_id as string | undefined,
                }]
                : [];
        });

        return {
            orderId,
            shortOrderId: orderId.slice(0, 8),
            renterUserId: renterProfile?.user_id ?? null,
            vendorUserIds: [
                ...new Set(productContexts.flatMap((item) => item.vendorUserId ? [item.vendorUserId] : [])),
            ],
            productName: productContexts[0]?.productName ?? "sản phẩm",
            shopName: productContexts[0]?.shopName ?? "shop",
        };
    }

    private buildPayload(
        type: OrderNotificationType,
        audience: NotificationAudience,
        context: OrderContext,
    ): NotificationPayload {
        const copy = this.getCopy(type, audience, context);

        return {
            type,
            title: copy.title,
            content: copy.content,
            actionUrl: this.getActionUrl(type, audience, context.orderId),
            relatedType: "ORDER",
            relatedId: context.orderId,
        };
    }

    private getActionUrl(
        type: OrderNotificationType,
        audience: NotificationAudience,
        orderId: string,
    ) {
        if (audience === "RENTER") return `/orders/${orderId}`;

        const vendorReturnTypes: OrderNotificationType[] = [
            NotificationTypes.EarlyReturnRequested,
            NotificationTypes.EarlyReturnApproved,
            NotificationTypes.EarlyReturnRejected,
            NotificationTypes.EarlyReturnReceived,
            NotificationTypes.OrderCompleted,
        ];

        return vendorReturnTypes.includes(type)
            ? `/dashboard/vendor/returns?orderId=${orderId}`
            : `/dashboard/vendor?orderId=${orderId}`;
    }

    private getCopy(
        type: OrderNotificationType,
        audience: NotificationAudience,
        context: OrderContext,
    ) {
        const orderLabel = `#${context.shortOrderId}`;
        const productText = context.productName ? ` (${context.productName})` : "";

        const copyByType: Record<OrderNotificationType, Record<NotificationAudience, { title: string; content: string }>> = {
            [NotificationTypes.OrderCreated]: {
                RENTER: {
                    title: "Đơn thuê đã được tạo",
                    content: `Đơn ${orderLabel}${productText} đã được tạo và đang chờ thanh toán.`,
                },
                VENDOR: {
                    title: "Có đơn thuê mới đang chờ thanh toán",
                    content: `Đơn ${orderLabel}${productText} đã được tạo. Shop sẽ nhận yêu cầu duyệt sau khi khách thanh toán.`,
                },
            },
            [NotificationTypes.OrderPaid]: {
                RENTER: {
                    title: "Thanh toán thành công",
                    content: `Đơn ${orderLabel} đã thanh toán thành công và đang chờ shop xác nhận.`,
                },
                VENDOR: {
                    title: "Có đơn chờ shop duyệt",
                    content: `Đơn ${orderLabel}${productText} đã thanh toán. Vui lòng kiểm tra và duyệt đơn.`,
                },
            },
            [NotificationTypes.PaymentFailed]: {
                RENTER: {
                    title: "Thanh toán thất bại",
                    content: `Thanh toán cho đơn ${orderLabel} chưa thành công. Vui lòng thử lại hoặc chọn phương thức khác.`,
                },
                VENDOR: {
                    title: "Thanh toán đơn thuê thất bại",
                    content: `Đơn ${orderLabel}${productText} chưa thanh toán thành công.`,
                },
            },
            [NotificationTypes.OrderConfirmed]: {
                RENTER: {
                    title: "Shop đã duyệt đơn thuê",
                    content: `Shop ${context.shopName} đã xác nhận đơn ${orderLabel}.`,
                },
                VENDOR: {
                    title: "Bạn đã duyệt đơn thuê",
                    content: `Đơn ${orderLabel}${productText} đã được xác nhận.`,
                },
            },
            [NotificationTypes.OrderCancelled]: {
                RENTER: {
                    title: "Shop đã từ chối đơn thuê",
                    content: `Shop ${context.shopName} đã từ chối đơn ${orderLabel}. Amonzan sẽ hỗ trợ xử lý hoàn tiền nếu cần.`,
                },
                VENDOR: {
                    title: "Bạn đã từ chối đơn thuê",
                    content: `Đơn ${orderLabel}${productText} đã bị từ chối.`,
                },
            },
            [NotificationTypes.OrderRenterConfirmedReceived]: {
                RENTER: {
                    title: "Bạn đã xác nhận nhận hàng",
                    content: `Đơn ${orderLabel} đã chuyển sang trạng thái đang thuê.`,
                },
                VENDOR: {
                    title: "Khách đã xác nhận nhận hàng",
                    content: `Khách thuê đã xác nhận nhận hàng cho đơn ${orderLabel}.`,
                },
            },
            [NotificationTypes.EarlyReturnRequested]: {
                RENTER: {
                    title: "Đã gửi yêu cầu trả sớm",
                    content: `Yêu cầu trả hàng sớm cho đơn ${orderLabel} đã được gửi đến shop.`,
                },
                VENDOR: {
                    title: "Có yêu cầu trả hàng sớm",
                    content: `Người thuê đã gửi yêu cầu trả hàng sớm cho đơn ${orderLabel}.`,
                },
            },
            [NotificationTypes.EarlyReturnApproved]: {
                RENTER: {
                    title: "Shop đã chấp nhận trả sớm",
                    content: `Yêu cầu trả hàng sớm cho đơn ${orderLabel} đã được shop chấp nhận.`,
                },
                VENDOR: {
                    title: "Bạn đã chấp nhận trả sớm",
                    content: `Đơn ${orderLabel} đã chuyển sang chờ hoàn trả.`,
                },
            },
            [NotificationTypes.EarlyReturnRejected]: {
                RENTER: {
                    title: "Shop đã từ chối trả sớm",
                    content: `Yêu cầu trả hàng sớm cho đơn ${orderLabel} đã bị từ chối. Bạn có thể gửi khiếu nại nếu không đồng ý.`,
                },
                VENDOR: {
                    title: "Bạn đã từ chối trả sớm",
                    content: `Yêu cầu trả hàng sớm cho đơn ${orderLabel} đã bị từ chối.`,
                },
            },
            [NotificationTypes.EarlyReturnReceived]: {
                RENTER: {
                    title: "Shop đã xác nhận nhận hàng trả",
                    content: `Shop đã xác nhận nhận hàng trả cho đơn ${orderLabel}.`,
                },
                VENDOR: {
                    title: "Bạn đã xác nhận nhận hàng trả",
                    content: `Đơn ${orderLabel} đã được xác nhận hoàn trả.`,
                },
            },
            [NotificationTypes.OrderCompleted]: {
                RENTER: {
                    title: "Đơn thuê đã hoàn tất",
                    content: `Đơn ${orderLabel} đã hoàn tất. Bạn có thể xem lại chi tiết đơn trong lịch sử thuê.`,
                },
                VENDOR: {
                    title: "Đơn thuê đã hoàn tất",
                    content: `Đơn ${orderLabel}${productText} đã hoàn tất.`,
                },
            },
        };

        return copyByType[type][audience];
    }

    private first(value: any) {
        return Array.isArray(value) ? value[0] : value;
    }
}
