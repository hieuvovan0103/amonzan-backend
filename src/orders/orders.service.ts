import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";
import { NotificationTypes } from "../modules/notifications/notification-types";
import { ConfirmReturnReceivedDto } from "./dto/confirm-return-received.dto";
import { CreateOrderDto } from "./dto/create-order.dto";
import { EarlyReturnRequestDto } from "./dto/early-return-request.dto";
import { VendorRenterReviewDto } from "./dto/vendor-renter-review.dto";
import type { CreateOrderResponseDto } from "./dto/create-order-response.dto";
import type { MyOrdersResponseDto } from "./dto/my-orders-response.dto";
import { OrderNotificationService } from "./order-notification.service";

type CalculatedOrderItem = {
    variantId: string;
    shopId: string;
    quantity: number;
    rentalStart: string;
    rentalEnd: string;
    rentalDays: number;
    unitPricePerDay: number;
    lineSubtotal: number;
    lineDeposit: number;
};

@Injectable()
export class OrdersService {
    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly orderNotificationService: OrderNotificationService,
    ) {}

    private readonly bookedOrderStatuses = [
        "PENDING_VENDOR_APPROVAL",
        "CONFIRMED",
        "READY_FOR_PICKUP",
        "IN_RENTAL",
        "RETURN_PENDING",
        "LATE",
        "DISPUTED",
    ];

    async createOrder(
        authUserId: string | undefined,
        dto: CreateOrderDto,
    ): Promise<CreateOrderResponseDto> {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để đặt thuê");
        }

        if (!dto.items || dto.items.length === 0) {
            throw new BadRequestException("Đơn thuê phải có ít nhất một sản phẩm");
        }

        const supabase = this.supabaseService.client;
        const userProfile = await this.getUserProfile(authUserId);
        const renterProfile = await this.getRenterProfile(userProfile.user_id);

        await this.validateAddress(dto.addressId, userProfile.user_id);

        const penaltyPolicyId = await this.getDefaultPenaltyPolicyId();
        const calculatedItems = await this.validateAndCalculateItems(dto.items);
        this.validateSingleShopOrder(calculatedItems);
        const subtotal = calculatedItems.reduce((sum, item) => sum + item.lineSubtotal, 0);
        const depositAmount = 0;
        const shippingFee = this.calculateShippingFee();
        const discountAmount = await this.calculateDiscount(dto.voucherCode, subtotal);
        const totalAmount = subtotal + shippingFee - discountAmount;
        const rentalStart = this.getEarliestRentalStart(calculatedItems);
        const rentalEnd = this.getLatestRentalEnd(calculatedItems);

        const { data: order, error: orderError } = await supabase
            .from("rental_orders")
            .insert({
                renter_profile_id: renterProfile.renter_profile_id,
                address_id: dto.addressId,
                voucher_id: null,
                penalty_policy_id: penaltyPolicyId,
                status: "PENDING_PAYMENT",
                payment_status: "UNPAID",
                rental_start: rentalStart,
                rental_end: rentalEnd,
                subtotal,
                discount_amount: discountAmount,
                deposit_amount: depositAmount,
                shipping_fee: shippingFee,
                late_fee: 0,
                damage_fee: 0,
                total_amount: totalAmount,
                note: dto.note || null,
            })
            .select("order_id")
            .single();

        if (orderError || !order) {
            throw new BadRequestException(
                `Không thể tạo đơn thuê: ${orderError?.message || "Unknown error"}`,
            );
        }

        const orderItemsPayload = calculatedItems.map((item) => ({
            order_id: order.order_id,
            variant_id: item.variantId,
            quantity: item.quantity,
            unit_price_per_day: item.unitPricePerDay,
            line_subtotal: item.lineSubtotal,
            line_deposit: item.lineDeposit,
        }));

        const { error: orderItemsError } = await supabase
            .from("rental_order_items")
            .insert(orderItemsPayload);

        if (orderItemsError) {
            await this.rollbackOrder(order.order_id);
            throw new BadRequestException(
                `Không thể tạo chi tiết đơn thuê: ${orderItemsError.message}`,
            );
        }

        const { data: payment, error: paymentError } = await supabase
            .from("payment_transactions")
            .insert({
                order_id: order.order_id,
                method: "VNPAY",
                amount: totalAmount,
                external_ref: null,
                status: "UNPAID",
            })
            .select("transaction_id")
            .single();

        if (paymentError || !payment) {
            await this.rollbackOrder(order.order_id);
            throw new BadRequestException(
                `Không thể tạo giao dịch thanh toán: ${
                    paymentError?.message || "Unknown error"
                }`,
            );
        }

        await this.orderNotificationService.notifyOrderEvent(
            order.order_id,
            NotificationTypes.OrderCreated,
        );

        return {
            orderId: order.order_id,
            paymentTransactionId: payment.transaction_id,
            orderStatus: "PENDING_PAYMENT",
            paymentStatus: "UNPAID",
            subtotal,
            depositAmount,
            shippingFee,
            discountAmount,
            totalAmount,
        };
    }

    async getVendorOrders(authUserId: string | undefined, status = "PENDING_VENDOR_APPROVAL") {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để xem đơn thuê");
        }

        const supabase = this.supabaseService.client;
        const shop = await this.getVendorShop(authUserId);
        const variantIds = await this.getShopVariantIds(shop.shop_id);

        if (variantIds.length === 0) {
            return { orders: [] };
        }

        const { data: vendorItems, error: vendorItemsError } = await supabase
            .from("rental_order_items")
            .select("order_id")
            .in("variant_id", variantIds);

        if (vendorItemsError) {
            throw new BadRequestException(
                `Không thể tải đơn thuê của shop: ${vendorItemsError.message}`,
            );
        }

        const orderIds = [...new Set((vendorItems ?? []).map((item) => item.order_id))];

        if (orderIds.length === 0) {
            return { orders: [] };
        }

        let query = supabase
            .from("rental_orders")
            .select(
                `
                order_id,
                status,
                payment_status,
                rental_start,
                rental_end,
                subtotal,
                deposit_amount,
                shipping_fee,
                discount_amount,
                total_amount,
                note,
                created_at,
                confirmed_at,
                renter_profiles (
                    renter_profile_id,
                    reputation_score,
                    penalty_points,
                    verification_status,
                    user_profiles (
                        full_name,
                        email,
                        phone_number
                    )
                ),
                addresses (
                    recipient_name,
                    phone_number,
                    line1,
                    line2,
                    ward,
                    district,
                    city,
                    province
                ),
                payment_transactions (
                    transaction_id,
                    method,
                    amount,
                    status,
                    provider,
                    paid_at
                ),
                rental_order_items (
                    order_item_id,
                    variant_id,
                    quantity,
                    unit_price_per_day,
                    line_subtotal,
                    line_deposit,
                    product_variants (
                        variant_name,
                        products (
                            product_id,
                            shop_id,
                            name,
                            slug,
                            product_images (
                                image_url,
                                sort_order,
                                is_primary
                            )
                        )
                    )
                )
            `,
            )
            .in("order_id", orderIds)
            .order("created_at", { ascending: false });

        if (status && status !== "ALL") {
            query = query.eq("status", status);
        }

        const { data: orders, error: ordersError } = await query;

        if (ordersError) {
            throw new BadRequestException(
                `Không thể tải danh sách đơn thuê: ${ordersError.message}`,
            );
        }

        return {
            orders: await Promise.all(
                (orders ?? []).map((order: any) => this.mapVendorOrder(order, shop.shop_id)),
            ),
        };
    }

    async getMyPaidOrders(authUserId: string | undefined): Promise<MyOrdersResponseDto> {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để xem lịch sử đơn hàng");
        }

        const supabase = this.supabaseService.client;
        const userProfile = await this.getUserProfile(authUserId);
        const renterProfile = await this.getRenterProfile(userProfile.user_id);

        const { data: orders, error } = await supabase
            .from("rental_orders")
            .select(
                `
                order_id,
                status,
                payment_status,
                rental_start,
                rental_end,
                subtotal,
                deposit_amount,
                shipping_fee,
                discount_amount,
                total_amount,
                note,
                created_at,
                confirmed_at,
                completed_at,
                early_return_requests (
                    request_id,
                    requested_return_at,
                    original_rental_end,
                    reason,
                    status,
                    vendor_response_note,
                    estimated_refund_amount,
                    condition_image_urls,
                    approved_at,
                    rejected_at,
                    received_at,
                    return_condition_note,
                    created_at
                ),
                pickup_return_records (
                    record_id,
                    return_requested_at,
                    return_request_note,
                    return_condition_status,
                    return_evidence_urls,
                    returned_at,
                    return_condition_note,
                    vendor_return_status,
                    vendor_return_note,
                    return_issue_reason,
                    return_issue_description,
                    return_issue_evidence_urls,
                    updated_at
                ),
                addresses (
                    recipient_name,
                    phone_number,
                    line1,
                    line2,
                    ward,
                    district,
                    city,
                    province
                ),
                payment_transactions (
                    transaction_id,
                    method,
                    amount,
                    status,
                    provider,
                    paid_at
                ),
                rental_order_items (
                    order_item_id,
                    variant_id,
                    quantity,
                    unit_price_per_day,
                    line_subtotal,
                    line_deposit,
                    product_variants (
                        variant_name,
                        products (
                            product_id,
                            shop_id,
                            name,
                            slug,
                            shop_profiles (
                                shop_id,
                                shop_name
                            ),
                            product_images (
                                image_url,
                                sort_order,
                                is_primary
                            )
                        )
                    )
                )
            `,
            )
            .eq("renter_profile_id", renterProfile.renter_profile_id)
            .eq("payment_status", "PAID")
            .order("created_at", { ascending: false });

        if (error) {
            throw new BadRequestException(`Không thể tải lịch sử đơn hàng: ${error.message}`);
        }

        return {
            orders: await Promise.all((orders ?? []).map((order: any) => this.mapMyOrder(order))),
        };
    }

    async estimateEarlyReturnRefund(
        authUserId: string | undefined,
        orderId: string,
        requestedReturnAt: string,
    ) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để ước tính hoàn tiền");
        }

        const userProfile = await this.getUserProfile(authUserId);
        const renterProfile = await this.getRenterProfile(userProfile.user_id);
        const order = await this.getOrderForEarlyReturn(orderId);

        if (order.renter_profile_id !== renterProfile.renter_profile_id) {
            throw new ForbiddenException("Bạn không có quyền thao tác với đơn thuê này");
        }

        this.validateEarlyReturnDate(order, requestedReturnAt);
        const estimatedRefundAmount = this.calculateEarlyReturnRefund(order, requestedReturnAt);

        return {
            orderId,
            requestedReturnAt,
            estimatedRefundAmount,
            message: estimatedRefundAmount > 0
                ? "Số tiền hoàn là ước tính. Shop/admin sẽ xử lý hoàn tiền sau khi xác nhận hàng trả."
                : "Trả hàng sớm không đảm bảo được hoàn tiền, tùy theo chính sách của shop.",
        };
    }

    async requestEarlyReturn(
        authUserId: string | undefined,
        orderId: string,
        dto: EarlyReturnRequestDto,
    ) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để yêu cầu trả hàng sớm");
        }

        const supabase = this.supabaseService.client;
        const userProfile = await this.getUserProfile(authUserId);
        const renterProfile = await this.getRenterProfile(userProfile.user_id);
        const order = await this.getOrderForEarlyReturn(orderId);

        if (order.renter_profile_id !== renterProfile.renter_profile_id) {
            throw new ForbiddenException("Bạn không có quyền thao tác với đơn thuê này");
        }

        if (order.status !== "IN_RENTAL") {
            throw new BadRequestException("Chỉ đơn đang thuê mới có thể yêu cầu trả hàng sớm");
        }

        this.validateEarlyReturnDate(order, dto.requestedReturnAt);

        const { data: pendingRequest, error: pendingError } = await supabase
            .from("early_return_requests")
            .select("request_id")
            .eq("order_id", orderId)
            .eq("status", "PENDING")
            .maybeSingle();

        if (pendingError) {
            throw new BadRequestException(`Không thể kiểm tra yêu cầu trả sớm: ${pendingError.message}`);
        }

        if (pendingRequest) {
            throw new BadRequestException("Đơn này đang có yêu cầu trả hàng sớm chờ shop xử lý");
        }

        const estimatedRefundAmount = this.calculateEarlyReturnRefund(order, dto.requestedReturnAt);

        const { data, error } = await supabase
            .from("early_return_requests")
            .insert({
                order_id: orderId,
                renter_profile_id: renterProfile.renter_profile_id,
                requested_return_at: dto.requestedReturnAt,
                original_rental_end: order.rental_end,
                reason: dto.reason?.trim() || null,
                status: "PENDING",
                estimated_refund_amount: estimatedRefundAmount,
                condition_image_urls: dto.conditionImageUrls ?? [],
            })
            .select("*")
            .single();

        if (error || !data) {
            throw new BadRequestException(`Không thể gửi yêu cầu trả hàng sớm: ${error?.message || "Unknown error"}`);
        }

        await this.orderNotificationService.notifyOrderEvent(
            orderId,
            NotificationTypes.EarlyReturnRequested,
        );

        return {
            request: this.mapEarlyReturnRequest(data),
            message: "Đã gửi yêu cầu trả hàng sớm đến shop.",
        };
    }

    async confirmRenterReceived(authUserId: string | undefined, orderId: string) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để xác nhận đã nhận hàng");
        }

        const supabase = this.supabaseService.client;
        const userProfile = await this.getUserProfile(authUserId);
        const renterProfile = await this.getRenterProfile(userProfile.user_id);
        const order = await this.getOrderForEarlyReturn(orderId);

        if (order.renter_profile_id !== renterProfile.renter_profile_id) {
            throw new ForbiddenException("Bạn không có quyền thao tác với đơn thuê này");
        }

        if (order.status !== "CONFIRMED") {
            throw new BadRequestException("Chỉ đơn đã được shop xác nhận mới có thể xác nhận nhận hàng");
        }

        const today = this.getTodayDateInVietnam();
        const rentalStart = this.normalizeDate(order.rental_start);

        if (!today || !rentalStart || today < rentalStart) {
            throw new BadRequestException("Bạn chỉ có thể xác nhận nhận hàng từ ngày bắt đầu thuê");
        }

        const { error: updateError } = await supabase
            .from("rental_orders")
            .update({
                status: "IN_RENTAL",
            })
            .eq("order_id", orderId);

        if (updateError) {
            throw new BadRequestException(`Không thể xác nhận nhận hàng: ${updateError.message}`);
        }

        await this.upsertPickupReturnRecord(orderId, {
            pickup_at: new Date().toISOString(),
            pickup_condition_note: "Người thuê đã xác nhận nhận hàng.",
        });

        await this.orderNotificationService.notifyOrderEvent(
            orderId,
            NotificationTypes.OrderRenterConfirmedReceived,
        );

        return {
            orderId,
            status: "IN_RENTAL",
            message: "Đã xác nhận nhận hàng. Đơn thuê đang trong thời gian sử dụng.",
        };
    }

    async getVendorEarlyReturnRequests(authUserId: string | undefined) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để xem yêu cầu trả sớm");
        }

        const supabase = this.supabaseService.client;
        const shop = await this.getVendorShop(authUserId);
        const variantIds = await this.getShopVariantIds(shop.shop_id);

        if (variantIds.length === 0) {
            return { requests: [] };
        }

        const { data: vendorItems, error: vendorItemsError } = await supabase
            .from("rental_order_items")
            .select("order_id")
            .in("variant_id", variantIds);

        if (vendorItemsError) {
            throw new BadRequestException(`Không thể tải đơn của shop: ${vendorItemsError.message}`);
        }

        const orderIds = [...new Set((vendorItems ?? []).map((item) => item.order_id))];
        if (orderIds.length === 0) {
            return { requests: [] };
        }

        const { data, error } = await supabase
            .from("early_return_requests")
            .select(
                `
                *,
                rental_orders (
                    order_id,
                    status,
                    payment_status,
                    rental_start,
                    rental_end,
                    subtotal,
                    total_amount,
                    renter_profiles (
                        renter_profile_id,
                        reputation_score,
                        penalty_points,
                        user_profiles (
                            full_name,
                            email,
                            phone_number
                        )
                    ),
                    rental_order_items (
                        order_item_id,
                        variant_id,
                        quantity,
                        line_subtotal,
                        product_variants (
                            variant_name,
                            products (
                                product_id,
                                shop_id,
                                name,
                                slug,
                                product_images (
                                    image_url,
                                    sort_order,
                                    is_primary
                                )
                            )
                        )
                    )
                )
            `,
            )
            .in("order_id", orderIds)
            .order("created_at", { ascending: false });

        if (error) {
            throw new BadRequestException(`Không thể tải yêu cầu trả sớm: ${error.message}`);
        }

        return {
            requests: await Promise.all(
                (data ?? []).map((request: any) =>
                    this.mapVendorEarlyReturnRequest(request, shop.shop_id),
                ),
            ),
        };
    }

    async approveEarlyReturn(authUserId: string | undefined, orderId: string) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để xử lý yêu cầu trả sớm");
        }

        const supabase = this.supabaseService.client;
        await this.assertVendorOwnsOrder(authUserId, orderId);
        const request = await this.getPendingEarlyReturnRequest(orderId);

        const { error: orderError } = await supabase
            .from("rental_orders")
            .update({
                status: "RETURN_PENDING",
                rental_end: request.requested_return_at,
            })
            .eq("order_id", orderId);

        if (orderError) {
            throw new BadRequestException(`Không thể cập nhật đơn thuê: ${orderError.message}`);
        }

        await this.upsertPickupReturnRecord(orderId, {
            return_condition_note: "Shop đã chấp nhận yêu cầu trả hàng sớm.",
        });

        const { error: requestError } = await supabase
            .from("early_return_requests")
            .update({
                status: "APPROVED",
                approved_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq("request_id", request.request_id);

        if (requestError) {
            throw new BadRequestException(`Không thể cập nhật yêu cầu trả sớm: ${requestError.message}`);
        }

        if (Number(request.estimated_refund_amount ?? 0) > 0) {
            await supabase
                .from("refund_transactions")
                .insert({
                    order_id: orderId,
                    amount: Number(request.estimated_refund_amount ?? 0),
                    reason: "Dự kiến hoàn tiền do khách trả hàng sớm. Cần shop/admin xử lý thủ công.",
                });
        }

        await this.orderNotificationService.notifyOrderEvent(
            orderId,
            NotificationTypes.EarlyReturnApproved,
        );

        return { orderId, status: "RETURN_PENDING", message: "Đã chấp nhận yêu cầu trả hàng sớm" };
    }

    async rejectEarlyReturn(authUserId: string | undefined, orderId: string, reason: string) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để xử lý yêu cầu trả sớm");
        }

        await this.assertVendorOwnsOrder(authUserId, orderId);
        const request = await this.getPendingEarlyReturnRequest(orderId);

        const trimmedReason = reason.trim();
        if (trimmedReason.length < 5) {
            throw new BadRequestException("Vui lòng nhập lý do từ chối rõ ràng");
        }

        const { error } = await this.supabaseService.client
            .from("early_return_requests")
            .update({
                status: "REJECTED",
                vendor_response_note: trimmedReason,
                rejected_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq("request_id", request.request_id);

        if (error) {
            throw new BadRequestException(`Không thể từ chối yêu cầu trả sớm: ${error.message}`);
        }

        await this.orderNotificationService.notifyOrderEvent(
            orderId,
            NotificationTypes.EarlyReturnRejected,
        );

        return { orderId, status: "IN_RENTAL", message: "Đã từ chối yêu cầu trả hàng sớm" };
    }

    async confirmReturnReceived(
        authUserId: string | undefined,
        orderId: string,
        dto: ConfirmReturnReceivedDto,
    ) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để xác nhận nhận hàng");
        }

        const supabase = this.supabaseService.client;
        await this.assertVendorOwnsOrder(authUserId, orderId);

        const returnedAt = dto.returnedAt || new Date().toISOString();
        await this.upsertPickupReturnRecord(orderId, {
            returned_at: returnedAt,
            return_condition_note: dto.returnConditionNote?.trim() || null,
        });

        const { data: request } = await supabase
            .from("early_return_requests")
            .select("request_id")
            .eq("order_id", orderId)
            .in("status", ["APPROVED", "PENDING"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (request) {
            await supabase
                .from("early_return_requests")
                .update({
                    status: "RECEIVED",
                    received_at: returnedAt,
                    return_condition_note: dto.returnConditionNote?.trim() || null,
                    updated_at: new Date().toISOString(),
                })
                .eq("request_id", request.request_id);
        }

        const { error: orderError } = await supabase
            .from("rental_orders")
            .update({
                status: "COMPLETED",
                completed_at: returnedAt,
            })
            .eq("order_id", orderId);

        if (orderError) {
            throw new BadRequestException(`Không thể hoàn tất đơn trả hàng: ${orderError.message}`);
        }

        await this.orderNotificationService.notifyOrderEvent(
            orderId,
            NotificationTypes.EarlyReturnReceived,
        );
        await this.orderNotificationService.notifyOrderEvent(
            orderId,
            NotificationTypes.OrderCompleted,
        );

        return {
            orderId,
            status: "COMPLETED",
            message: dto.damaged
                ? "Đã ghi nhận hàng trả. Sản phẩm có hư hỏng, cần xử lý phí đền bù nếu có."
                : "Đã xác nhận nhận hàng và hoàn tất đơn thuê.",
        };
    }

    async reviewVendorOrder(
        authUserId: string | undefined,
        orderId: string,
        action: "approve" | "reject",
    ) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để duyệt đơn thuê");
        }

        const supabase = this.supabaseService.client;
        const shop = await this.getVendorShop(authUserId);
        const variantIds = await this.getShopVariantIds(shop.shop_id);

        const { data: order, error: orderError } = await supabase
            .from("rental_orders")
            .select("order_id, status, payment_status")
            .eq("order_id", orderId)
            .single();

        if (orderError || !order) {
            throw new NotFoundException("Không tìm thấy đơn thuê");
        }

        if (order.status !== "PENDING_VENDOR_APPROVAL" || order.payment_status !== "PAID") {
            throw new BadRequestException("Chỉ có thể duyệt đơn đã thanh toán và đang chờ shop xác nhận");
        }

        const { data: orderItems, error: itemsError } = await supabase
            .from("rental_order_items")
            .select("variant_id, quantity")
            .eq("order_id", orderId);

        if (itemsError || !orderItems?.length) {
            throw new BadRequestException("Không thể kiểm tra sản phẩm trong đơn");
        }

        const hasNonShopItem = orderItems.some(
            (item) => !variantIds.includes(item.variant_id),
        );

        if (hasNonShopItem) {
            throw new BadRequestException("Đơn thuê này không thuộc hoàn toàn về shop của bạn");
        }

        if (action === "reject") {
            const { error: updateError } = await supabase
                .from("rental_orders")
                .update({
                    status: "CANCELLED",
                    note: "Shop đã từ chối đơn. Cần xử lý hoàn tiền cho khách.",
                })
                .eq("order_id", orderId);

            if (updateError) {
                throw new BadRequestException(`Không thể từ chối đơn thuê: ${updateError.message}`);
            }

            await this.orderNotificationService.notifyOrderEvent(
                orderId,
                NotificationTypes.OrderCancelled,
            );

            return { orderId, status: "CANCELLED", message: "Đã từ chối đơn thuê" };
        }

        const { error: updateError } = await supabase
            .from("rental_orders")
            .update({
                status: "CONFIRMED",
                confirmed_at: new Date().toISOString(),
            })
            .eq("order_id", orderId);

        if (updateError) {
            throw new BadRequestException(`Không thể chấp nhận đơn thuê: ${updateError.message}`);
        }

        await this.orderNotificationService.notifyOrderEvent(
            orderId,
            NotificationTypes.OrderConfirmed,
        );

        return { orderId, status: "CONFIRMED", message: "Đã chấp nhận đơn thuê" };
    }

    async reviewRenter(
        authUserId: string | undefined,
        orderId: string,
        dto: VendorRenterReviewDto,
    ) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để đánh giá người thuê");
        }

        const supabase = this.supabaseService.client;
        const shop = await this.getVendorShop(authUserId);
        await this.assertVendorOwnsOrder(authUserId, orderId);

        const { data: order, error: orderError } = await supabase
            .from("rental_orders")
            .select("order_id, status, renter_profile_id")
            .eq("order_id", orderId)
            .single();

        if (orderError || !order) {
            throw new NotFoundException("Không tìm thấy đơn thuê");
        }

        if (order.status !== "COMPLETED") {
            throw new BadRequestException("Chỉ có thể đánh giá người thuê sau khi đã nhận hàng trả về.");
        }

        const { data, error } = await supabase
            .from("reviews")
            .upsert(
                {
                    reviewer_shop_id: shop.shop_id,
                    renter_profile_id: null,
                    order_id: orderId,
                    target_type: "RENTER",
                    target_id: order.renter_profile_id,
                    rating: dto.rating,
                    comment: dto.comment?.trim() || null,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "reviewer_shop_id,order_id,target_type,target_id" },
            )
            .select(
                `
                review_id,
                order_id,
                target_type,
                target_id,
                rating,
                comment,
                created_at,
                is_hidden,
                reviewer_shop_id
            `,
            )
            .single();

        if (error || !data) {
            throw new BadRequestException(`Không thể lưu đánh giá người thuê: ${error?.message ?? "Unknown error"}`);
        }

        const reviews = await this.attachRenterReviewShopNames([data]);
        return this.mapRenterReview(reviews[0]);
    }

    private async getUserProfile(authUserId: string) {
        const supabase = this.supabaseService.client;

        const { data, error } = await supabase
            .from("user_profiles")
            .select("user_id, auth_user_id, full_name, email, phone_number")
            .eq("auth_user_id", authUserId)
            .single();

        if (error || !data) {
            throw new NotFoundException("Không tìm thấy hồ sơ người dùng");
        }

        return data;
    }

    private async getRenterProfile(userId: string) {
        const supabase = this.supabaseService.client;

        const { data, error } = await supabase
            .from("renter_profiles")
            .select("renter_profile_id, user_id")
            .eq("user_id", userId)
            .single();

        if (error || !data) {
            throw new NotFoundException("Không tìm thấy hồ sơ người thuê");
        }

        return data;
    }

    private async getVendorShop(authUserId: string) {
        const supabase = this.supabaseService.client;
        const profile = await this.getUserProfile(authUserId);

        const { data, error } = await supabase
            .from("shop_profiles")
            .select("shop_id, shop_name, user_id")
            .eq("user_id", profile.user_id)
            .single();

        if (error || !data) {
            throw new NotFoundException("Không tìm thấy shop của tài khoản này");
        }

        return data;
    }

    private async getShopVariantIds(shopId: string) {
        const supabase = this.supabaseService.client;

        const { data, error } = await supabase
            .from("product_variants")
            .select("variant_id, products!inner(shop_id)")
            .eq("products.shop_id", shopId);

        if (error) {
            throw new BadRequestException(`Không thể tải sản phẩm của shop: ${error.message}`);
        }

        return (data ?? []).map((variant: any) => variant.variant_id as string);
    }

    private async assertVendorOwnsOrder(authUserId: string, orderId: string) {
        const shop = await this.getVendorShop(authUserId);
        const variantIds = await this.getShopVariantIds(shop.shop_id);

        if (variantIds.length === 0) {
            throw new BadRequestException("Shop chưa có sản phẩm trong đơn thuê này");
        }

        const { data: orderItems, error } = await this.supabaseService.client
            .from("rental_order_items")
            .select("variant_id")
            .eq("order_id", orderId);

        if (error || !orderItems?.length) {
            throw new NotFoundException("Không tìm thấy đơn thuê");
        }

        const hasNonShopItem = orderItems.some(
            (item) => !variantIds.includes(item.variant_id),
        );

        if (hasNonShopItem) {
            throw new ForbiddenException("Bạn không có quyền xử lý đơn thuê này");
        }

        return shop;
    }

    private async getOrderForEarlyReturn(orderId: string) {
        const { data, error } = await this.supabaseService.client
            .from("rental_orders")
            .select(
                `
                order_id,
                renter_profile_id,
                status,
                payment_status,
                rental_start,
                rental_end,
                subtotal,
                total_amount
            `,
            )
            .eq("order_id", orderId)
            .single();

        if (error || !data) {
            throw new NotFoundException("Không tìm thấy đơn thuê");
        }

        return data;
    }

    private async getPendingEarlyReturnRequest(orderId: string) {
        const { data, error } = await this.supabaseService.client
            .from("early_return_requests")
            .select("*")
            .eq("order_id", orderId)
            .eq("status", "PENDING")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            throw new BadRequestException(`Không thể tải yêu cầu trả sớm: ${error.message}`);
        }

        if (!data) {
            throw new BadRequestException("Không có yêu cầu trả hàng sớm đang chờ xử lý");
        }

        return data;
    }

    private validateEarlyReturnDate(order: any, requestedReturnAt: string) {
        const requested = new Date(requestedReturnAt);
        const now = new Date();
        const rentalStart = new Date(order.rental_start);
        const rentalEnd = new Date(order.rental_end);

        if (Number.isNaN(requested.getTime())) {
            throw new BadRequestException("Ngày giờ trả hàng không hợp lệ");
        }

        if (requested < now) {
            throw new BadRequestException("Ngày giờ trả hàng phải lớn hơn hoặc bằng hiện tại");
        }

        if (requested < rentalStart) {
            throw new BadRequestException("Ngày giờ trả hàng phải nằm trong thời gian thuê");
        }

        if (requested >= rentalEnd) {
            throw new BadRequestException("Ngày giờ trả sớm phải trước ngày trả ban đầu");
        }
    }

    private calculateEarlyReturnRefund(order: any, requestedReturnAt: string) {
        const rentalStart = new Date(order.rental_start);
        const rentalEnd = new Date(order.rental_end);
        const requested = new Date(requestedReturnAt);
        const totalMs = Math.max(1, rentalEnd.getTime() - rentalStart.getTime());
        const unusedMs = Math.max(0, rentalEnd.getTime() - requested.getTime());
        const refundableBase = Math.max(0, Number(order.subtotal ?? 0));

        // Conservative policy: only estimate 50% of unused rental fee, admin/vendor handles final refund.
        return Number(((refundableBase * unusedMs) / totalMs * 0.5).toFixed(2));
    }

    private async upsertPickupReturnRecord(orderId: string, updates: Record<string, any>) {
        const supabase = this.supabaseService.client;
        const { data: existing, error: existingError } = await supabase
            .from("pickup_return_records")
            .select("record_id")
            .eq("order_id", orderId)
            .maybeSingle();

        if (existingError) {
            throw new BadRequestException(`Không thể kiểm tra biên bản trả hàng: ${existingError.message}`);
        }

        if (existing) {
            const { error } = await supabase
                .from("pickup_return_records")
                .update(updates)
                .eq("record_id", existing.record_id);

            if (error) {
                throw new BadRequestException(`Không thể cập nhật biên bản trả hàng: ${error.message}`);
            }
            return;
        }

        const { error } = await supabase
            .from("pickup_return_records")
            .insert({
                order_id: orderId,
                ...updates,
            });

        if (error) {
            throw new BadRequestException(`Không thể tạo biên bản trả hàng: ${error.message}`);
        }
    }

    private async validateAddress(addressId: string, userId: string) {
        const supabase = this.supabaseService.client;

        const { data, error } = await supabase
            .from("addresses")
            .select("address_id, user_id")
            .eq("address_id", addressId)
            .eq("user_id", userId)
            .single();

        if (error || !data) {
            throw new BadRequestException(
                "Địa chỉ giao nhận không tồn tại hoặc không thuộc tài khoản này",
            );
        }

        return data;
    }

    private async getDefaultPenaltyPolicyId() {
        const supabase = this.supabaseService.client;

        const { data, error } = await supabase
            .from("penalty_policies")
            .select("policy_id")
            .order("name", { ascending: true })
            .limit(1)
            .single();

        if (error || !data) {
            throw new BadRequestException(
                "Chưa có penalty policy. Hãy thêm chính sách phạt mặc định trước",
            );
        }

        return data.policy_id;
    }

    private async validateAndCalculateItems(
        items: CreateOrderDto["items"],
    ): Promise<CalculatedOrderItem[]> {
        const supabase = this.supabaseService.client;
        const variantIds = [...new Set(items.map((item) => item.variantId))];

        const { data: variants, error } = await supabase
            .from("product_variants")
            .select(
                `
        variant_id,
        product_id,
        variant_name,
        base_daily_rate,
        total_stock,
        available_stock,
        products (
          product_id,
          shop_id,
          name,
          status
        )
      `,
            )
            .in("variant_id", variantIds);

        if (error) {
            throw new BadRequestException(
                `Không thể kiểm tra sản phẩm: ${error.message}`,
            );
        }

        return Promise.all(items.map(async (item) => {
            const variant = variants?.find(
                (variant: any) => variant.variant_id === item.variantId,
            );

            if (!variant) {
                throw new BadRequestException(
                    `Không tìm thấy biến thể sản phẩm: ${item.variantId}`,
                );
            }

            const product = Array.isArray(variant.products)
                ? variant.products[0]
                : variant.products;

            if (product?.status !== "APPROVED") {
                throw new BadRequestException(
                    `Sản phẩm "${product?.name || ""}" hiện không thể thuê`,
                );
            }

            if (Number(variant.available_stock || 0) < item.quantity) {
                throw new BadRequestException(
                    `Sản phẩm "${variant.variant_name}" không còn đủ số lượng`,
                );
            }

            const rentalDays = this.calculateRentalDays(
                item.rentalStart,
                item.rentalEnd,
            );
            const availability = await this.getVariantAvailability({
                variantId: item.variantId,
                totalStock: Math.min(
                    Number(variant.total_stock || 0),
                    Number(variant.available_stock || 0),
                ),
                rentalStart: item.rentalStart,
                rentalEnd: item.rentalEnd,
            });

            if (!availability.available || availability.availableStock < item.quantity) {
                throw new BadRequestException(
                    availability.message ||
                        `Sản phẩm "${variant.variant_name}" không khả dụng trong thời gian đã chọn`,
                );
            }

            const unitPricePerDay = Number(variant.base_daily_rate || 0);

            return {
                variantId: item.variantId,
                shopId: product?.shop_id || "",
                quantity: item.quantity,
                rentalStart: item.rentalStart,
                rentalEnd: item.rentalEnd,
                rentalDays,
                unitPricePerDay,
                lineSubtotal: unitPricePerDay * rentalDays * item.quantity,
                lineDeposit: 0,
            };
        }));
    }

    private calculateRentalDays(rentalStart: string, rentalEnd: string) {
        const startDate = this.normalizeDate(rentalStart);
        const endDate = this.normalizeDate(rentalEnd);

        if (!startDate || !endDate) {
            throw new BadRequestException("Ngày thuê không hợp lệ");
        }

        if (endDate <= startDate) {
            throw new BadRequestException("Ngày trả phải sau ngày thuê");
        }

        const today = this.normalizeDate(new Date().toISOString());
        if (today && startDate < today) {
            throw new BadRequestException("Ngày thuê không được ở trong quá khứ");
        }

        const start = new Date(`${startDate}T00:00:00.000Z`);
        const end = new Date(`${endDate}T00:00:00.000Z`);

        return Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
    }

    private normalizeDate(value: string) {
        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return null;
        }

        return date.toISOString().slice(0, 10);
    }

    private getTodayDateInVietnam() {
        return new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Ho_Chi_Minh",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(new Date());
    }

    private async getVariantAvailability({
        variantId,
        totalStock,
        rentalStart,
        rentalEnd,
    }: {
        variantId: string;
        totalStock: number;
        rentalStart: string;
        rentalEnd: string;
    }) {
        const start = this.normalizeDate(rentalStart);
        const end = this.normalizeDate(rentalEnd);

        if (!start || !end || end <= start) {
            return {
                available: false,
                availableStock: 0,
                bookedQuantity: 0,
                blocked: false,
                message: "Ngày thuê không hợp lệ",
            };
        }

        const isBlocked = await this.hasBlockedPeriod(variantId, start, end);
        if (isBlocked) {
            return {
                available: false,
                availableStock: 0,
                bookedQuantity: totalStock,
                blocked: true,
                message: "Sản phẩm đã bị khóa lịch trong thời gian này",
            };
        }

        const bookedQuantity = await this.getBookedQuantity(variantId, start, end);
        const availableStock = Math.max(0, totalStock - bookedQuantity);

        return {
            available: availableStock > 0,
            availableStock,
            bookedQuantity,
            blocked: false,
            message:
                availableStock > 0
                    ? null
                    : "Sản phẩm đã kín lịch trong thời gian này",
        };
    }

    private async hasBlockedPeriod(variantId: string, start: string, end: string) {
        const supabase = this.supabaseService.client;

        const { data: calendar } = await supabase
            .from("availability_calendars")
            .select("calendar_id")
            .eq("variant_id", variantId)
            .maybeSingle();

        if (!calendar) {
            return false;
        }

        const { data, error } = await supabase
            .from("calendar_blocked_periods")
            .select("id")
            .eq("calendar_id", calendar.calendar_id)
            .lt("start_date", end)
            .gt("end_date", start)
            .limit(1);

        if (error) {
            throw new BadRequestException(`Không thể kiểm tra lịch khóa: ${error.message}`);
        }

        return Boolean(data?.length);
    }

    private async getBookedQuantity(variantId: string, start: string, end: string) {
        const supabase = this.supabaseService.client;

        const { data, error } = await supabase
            .from("rental_order_items")
            .select(
                `
                quantity,
                rental_orders!inner (
                    status,
                    rental_start,
                    rental_end
                )
            `,
            )
            .eq("variant_id", variantId)
            .in("rental_orders.status", this.bookedOrderStatuses)
            .lt("rental_orders.rental_start", end)
            .gt("rental_orders.rental_end", start);

        if (error) {
            throw new BadRequestException(`Không thể kiểm tra lịch thuê: ${error.message}`);
        }

        return (data ?? []).reduce(
            (sum, item) => sum + Number(item.quantity || 0),
            0,
        );
    }

    private validateSingleShopOrder(items: CalculatedOrderItem[]) {
        const shopIds = [...new Set(items.map((item) => item.shopId).filter(Boolean))];

        if (shopIds.length > 1) {
            throw new BadRequestException(
                "Mỗi đơn thuê hiện chỉ hỗ trợ sản phẩm từ một cửa hàng. Vui lòng tách giỏ hàng theo từng shop.",
            );
        }
    }

    private calculateShippingFee() {
        return 45000;
    }

    private async calculateDiscount(
        voucherCode: string | undefined,
        subtotal: number,
    ) {
        if (!voucherCode) return 0;

        if (voucherCode.trim().toUpperCase() === "AMONZAN50") {
            return Math.min(50000, subtotal);
        }

        return 0;
    }

    private getEarliestRentalStart(items: { rentalStart: string }[]) {
        return items
            .map((item) => item.rentalStart)
            .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
    }

    private getLatestRentalEnd(items: { rentalEnd: string }[]) {
        return items
            .map((item) => item.rentalEnd)
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    }

    private async getRenterReviewHistory(renterProfileId?: string | null) {
        if (!renterProfileId) {
            return { summary: { averageRating: 0, count: 0 }, reviews: [] };
        }

        const { data, error } = await this.supabaseService.client
            .from("reviews")
            .select(
                `
                review_id,
                order_id,
                target_type,
                target_id,
                rating,
                comment,
                created_at,
                is_hidden,
                reviewer_shop_id
            `,
            )
            .eq("target_type", "RENTER")
            .eq("target_id", renterProfileId)
            .eq("is_hidden", false)
            .order("created_at", { ascending: false })
            .limit(5);

        if (error) {
            console.warn("[orders] Unable to load renter review history:", error.message);
            return { summary: { averageRating: 0, count: 0 }, reviews: [] };
        }

        const reviewsWithShopNames = await this.attachRenterReviewShopNames(data ?? []);
        const reviews = reviewsWithShopNames.map((review: any) => this.mapRenterReview(review));
        const averageRating = reviews.length
            ? Number((reviews.reduce((sum: number, review: any) => sum + review.rating, 0) / reviews.length).toFixed(2))
            : 0;

        return {
            summary: { averageRating, count: reviews.length },
            reviews,
        };
    }

    private mapRenterReview(review: any) {
        const shop = Array.isArray(review.shop_profiles)
            ? review.shop_profiles[0]
            : review.shop_profiles;

        return {
            reviewId: review.review_id,
            orderId: review.order_id,
            rating: Number(review.rating ?? 0),
            comment: review.comment,
            createdAt: review.created_at,
            shopName: review.shopName ?? shop?.shop_name ?? "Cửa hàng Amonzan",
        };
    }

    private async getOrderRenterReview(orderId: string) {
        const { data, error } = await this.supabaseService.client
            .from("reviews")
            .select(
                `
                review_id,
                order_id,
                target_type,
                target_id,
                rating,
                comment,
                created_at,
                is_hidden,
                report_status,
                reviewer_shop_id
            `,
            )
            .eq("target_type", "RENTER")
            .eq("order_id", orderId)
            .eq("is_hidden", false)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error || !data) {
            return null;
        }

        const reviews = await this.attachRenterReviewShopNames([data]);

        return {
            ...this.mapRenterReview(reviews[0]),
            reportStatus: data.report_status,
        };
    }

    private async attachRenterReviewShopNames(reviews: any[]) {
        const shopIds = [
            ...new Set(
                reviews
                    .map((review) => review.reviewer_shop_id)
                    .filter(Boolean),
            ),
        ];

        if (shopIds.length === 0) {
            return reviews;
        }

        const { data } = await this.supabaseService.client
            .from("shop_profiles")
            .select("shop_id, shop_name")
            .in("shop_id", shopIds);

        const shopsById = new Map(
            (data ?? []).map((shop: any) => [shop.shop_id, shop.shop_name]),
        );

        return reviews.map((review) => ({
            ...review,
            shopName: shopsById.get(review.reviewer_shop_id) ?? null,
        }));
    }

    private async mapVendorOrder(order: any, shopId: string) {
        const renter = Array.isArray(order.renter_profiles)
            ? order.renter_profiles[0]
            : order.renter_profiles;
        const user = Array.isArray(renter?.user_profiles)
            ? renter.user_profiles[0]
            : renter?.user_profiles;
        const address = Array.isArray(order.addresses) ? order.addresses[0] : order.addresses;
        const payment = Array.isArray(order.payment_transactions)
            ? order.payment_transactions[0]
            : order.payment_transactions;
        const items = (order.rental_order_items ?? [])
            .filter((item: any) => {
                const variant = Array.isArray(item.product_variants)
                    ? item.product_variants[0]
                    : item.product_variants;
                const product = Array.isArray(variant?.products)
                    ? variant.products[0]
                    : variant?.products;

                return product?.shop_id === shopId;
            })
            .map((item: any) => {
                const variant = Array.isArray(item.product_variants)
                    ? item.product_variants[0]
                    : item.product_variants;
                const product = Array.isArray(variant?.products)
                    ? variant.products[0]
                    : variant?.products;
                const images = [...(product?.product_images ?? [])].sort(
                    (a: any, b: any) =>
                        Number(b.is_primary) - Number(a.is_primary) ||
                        Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
                );

                return {
                    orderItemId: item.order_item_id,
                    variantId: item.variant_id,
                    productId: product?.product_id ?? null,
                    productSlug: product?.slug ?? null,
                    productName: product?.name ?? "Sản phẩm",
                    productImage: images[0]?.image_url ?? null,
                    variantName: variant?.variant_name ?? null,
                    quantity: Number(item.quantity || 0),
                    unitPricePerDay: Number(item.unit_price_per_day || 0),
                    lineSubtotal: Number(item.line_subtotal || 0),
                    lineDeposit: Number(item.line_deposit || 0),
                };
            });

        const renterReviews = await this.getRenterReviewHistory(renter?.renter_profile_id);

        return {
            orderId: order.order_id,
            status: order.status,
            paymentStatus: order.payment_status,
            rentalStart: order.rental_start,
            rentalEnd: order.rental_end,
            subtotal: Number(order.subtotal || 0),
            depositAmount: Number(order.deposit_amount || 0),
            shippingFee: Number(order.shipping_fee || 0),
            discountAmount: Number(order.discount_amount || 0),
            totalAmount: Number(order.total_amount || 0),
            note: order.note,
            createdAt: order.created_at,
            confirmedAt: order.confirmed_at,
            renter: {
                fullName: user?.full_name ?? "Người thuê",
                email: user?.email ?? null,
                phoneNumber: user?.phone_number ?? null,
                reputationScore: Number(renter?.reputation_score ?? 0),
                penaltyPoints: Number(renter?.penalty_points ?? 0),
                verificationStatus: renter?.verification_status ?? "PENDING",
                reviews: renterReviews.reviews,
                reviewSummary: renterReviews.summary,
            },
            address: address
                ? {
                      recipientName: address.recipient_name,
                      phoneNumber: address.phone_number,
                      fullAddress: [
                          address.line1,
                          address.line2,
                          address.ward,
                          address.district,
                          address.city,
                          address.province,
                      ]
                          .filter(Boolean)
                          .join(", "),
                  }
                : null,
            payment: payment
                ? {
                      transactionId: payment.transaction_id,
                      method: payment.method,
                      amount: Number(payment.amount || 0),
                      status: payment.status,
                      provider: payment.provider,
                      paidAt: payment.paid_at,
                  }
                : null,
            items,
        };
    }

    private async mapMyOrder(order: any) {
        const address = Array.isArray(order.addresses) ? order.addresses[0] : order.addresses;
        const payment = Array.isArray(order.payment_transactions)
            ? order.payment_transactions[0]
            : order.payment_transactions;
        const earlyReturnRequests = [...(order.early_return_requests ?? [])].sort(
            (a: any, b: any) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        const returnRecord = Array.isArray(order.pickup_return_records)
            ? order.pickup_return_records[0]
            : order.pickup_return_records;
        const items = (order.rental_order_items ?? []).map((item: any) => {
            const variant = Array.isArray(item.product_variants)
                ? item.product_variants[0]
                : item.product_variants;
            const product = Array.isArray(variant?.products)
                ? variant.products[0]
                : variant?.products;
            const shop = Array.isArray(product?.shop_profiles)
                ? product.shop_profiles[0]
                : product?.shop_profiles;
            const images = [...(product?.product_images ?? [])].sort(
                (a: any, b: any) =>
                    Number(b.is_primary) - Number(a.is_primary) ||
                    Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
            );

            return {
                orderItemId: item.order_item_id,
                variantId: item.variant_id,
                productId: product?.product_id ?? null,
                productSlug: product?.slug ?? null,
                productName: product?.name ?? "Sản phẩm",
                productImage: images[0]?.image_url ?? null,
                variantName: variant?.variant_name ?? null,
                shopName: shop?.shop_name ?? null,
                quantity: Number(item.quantity || 0),
                unitPricePerDay: Number(item.unit_price_per_day || 0),
                lineSubtotal: Number(item.line_subtotal || 0),
                lineDeposit: Number(item.line_deposit || 0),
            };
        });

        const renterReview = await this.getOrderRenterReview(order.order_id);

        return {
            orderId: order.order_id,
            status: order.status,
            paymentStatus: order.payment_status,
            rentalStart: order.rental_start,
            rentalEnd: order.rental_end,
            subtotal: Number(order.subtotal || 0),
            depositAmount: Number(order.deposit_amount || 0),
            shippingFee: Number(order.shipping_fee || 0),
            discountAmount: Number(order.discount_amount || 0),
            totalAmount: Number(order.total_amount || 0),
            note: order.note,
            createdAt: order.created_at,
            confirmedAt: order.confirmed_at,
            completedAt: order.completed_at,
            earlyReturnRequest: earlyReturnRequests[0]
                ? this.mapEarlyReturnRequest(earlyReturnRequests[0])
                : null,
            returnRecord: returnRecord
                ? this.mapReturnRecord(returnRecord)
                : null,
            renterReview,
            address: address
                ? {
                      recipientName: address.recipient_name,
                      phoneNumber: address.phone_number,
                      fullAddress: [
                          address.line1,
                          address.line2,
                          address.ward,
                          address.district,
                          address.city,
                          address.province,
                      ]
                          .filter(Boolean)
                          .join(", "),
                  }
                : null,
            payment: payment
                ? {
                      transactionId: payment.transaction_id,
                      method: payment.method,
                      amount: Number(payment.amount || 0),
                      status: payment.status,
                      paidAt: payment.paid_at,
                      provider: payment.provider,
                  }
                : null,
            items,
        };
    }

    private mapEarlyReturnRequest(request: any) {
        return {
            requestId: request.request_id,
            orderId: request.order_id,
            requestedReturnAt: request.requested_return_at,
            originalRentalEnd: request.original_rental_end,
            reason: request.reason,
            status: request.status,
            vendorResponseNote: request.vendor_response_note,
            estimatedRefundAmount: Number(request.estimated_refund_amount ?? 0),
            conditionImageUrls: Array.isArray(request.condition_image_urls)
                ? request.condition_image_urls
                : [],
            approvedAt: request.approved_at,
            rejectedAt: request.rejected_at,
            receivedAt: request.received_at,
            returnConditionNote: request.return_condition_note,
            createdAt: request.created_at,
        };
    }

    private mapReturnRecord(record: any) {
        return {
            recordId: record.record_id,
            returnRequestedAt: record.return_requested_at,
            returnRequestNote: record.return_request_note,
            returnConditionStatus: record.return_condition_status,
            returnEvidenceUrls: Array.isArray(record.return_evidence_urls)
                ? record.return_evidence_urls
                : [],
            returnedAt: record.returned_at,
            returnConditionNote: record.return_condition_note,
            vendorReturnStatus: record.vendor_return_status,
            vendorReturnNote: record.vendor_return_note,
            returnIssueReason: record.return_issue_reason,
            returnIssueDescription: record.return_issue_description,
            returnIssueEvidenceUrls: Array.isArray(record.return_issue_evidence_urls)
                ? record.return_issue_evidence_urls
                : [],
            updatedAt: record.updated_at,
        };
    }

    private async mapVendorEarlyReturnRequest(request: any, shopId: string) {
        const order = Array.isArray(request.rental_orders)
            ? request.rental_orders[0]
            : request.rental_orders;
        const renter = Array.isArray(order?.renter_profiles)
            ? order.renter_profiles[0]
            : order?.renter_profiles;
        const user = Array.isArray(renter?.user_profiles)
            ? renter.user_profiles[0]
            : renter?.user_profiles;
        const items = (order?.rental_order_items ?? [])
            .filter((item: any) => {
                const variant = Array.isArray(item.product_variants)
                    ? item.product_variants[0]
                    : item.product_variants;
                const product = Array.isArray(variant?.products)
                    ? variant.products[0]
                    : variant?.products;
                return product?.shop_id === shopId;
            })
            .map((item: any) => {
                const variant = Array.isArray(item.product_variants)
                    ? item.product_variants[0]
                    : item.product_variants;
                const product = Array.isArray(variant?.products)
                    ? variant.products[0]
                    : variant?.products;
                const images = [...(product?.product_images ?? [])].sort(
                    (a: any, b: any) =>
                        Number(b.is_primary) - Number(a.is_primary) ||
                        Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
                );

                return {
                    orderItemId: item.order_item_id,
                    variantId: item.variant_id,
                    productId: product?.product_id ?? null,
                    productSlug: product?.slug ?? null,
                    productName: product?.name ?? "Sản phẩm",
                    productImage: images[0]?.image_url ?? null,
                    variantName: variant?.variant_name ?? null,
                    quantity: Number(item.quantity || 0),
                    lineSubtotal: Number(item.line_subtotal || 0),
                };
            });

        const renterReviews = await this.getRenterReviewHistory(renter?.renter_profile_id);

        return {
            ...this.mapEarlyReturnRequest(request),
            order: {
                orderId: order?.order_id,
                status: order?.status,
                paymentStatus: order?.payment_status,
                rentalStart: order?.rental_start,
                rentalEnd: order?.rental_end,
                subtotal: Number(order?.subtotal ?? 0),
                totalAmount: Number(order?.total_amount ?? 0),
            },
            renter: {
                fullName: user?.full_name ?? "Người thuê",
                email: user?.email ?? null,
                phoneNumber: user?.phone_number ?? null,
                reputationScore: Number(renter?.reputation_score ?? 0),
                penaltyPoints: Number(renter?.penalty_points ?? 0),
                reviews: renterReviews.reviews,
                reviewSummary: renterReviews.summary,
            },
            items,
        };
    }

    private async rollbackOrder(orderId: string) {
        await this.supabaseService.client
            .from("rental_orders")
            .delete()
            .eq("order_id", orderId);
    }
}
