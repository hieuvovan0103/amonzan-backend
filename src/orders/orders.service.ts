import {
    BadRequestException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import type { CreateOrderResponseDto } from "./dto/create-order-response.dto";

type CalculatedOrderItem = {
    variantId: string;
    shopId: string;
    quantity: number;
    rentalStart: string;
    rentalEnd: string;
    rentalDays: number;
    unitPricePerDay: number;
    depositPerItem: number;
    lineSubtotal: number;
    lineDeposit: number;
};

@Injectable()
export class OrdersService {
    constructor(private readonly supabaseService: SupabaseService) {}

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
        const depositAmount = calculatedItems.reduce((sum, item) => sum + item.lineDeposit, 0);
        const shippingFee = this.calculateShippingFee();
        const discountAmount = await this.calculateDiscount(dto.voucherCode, subtotal);
        const totalAmount = subtotal + depositAmount + shippingFee - discountAmount;
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
            orders: (orders ?? []).map((order: any) =>
                this.mapVendorOrder(order, shop.shop_id),
            ),
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
            const restoreResult = await this.restoreStockForOrder(orderId);

            if (!restoreResult.ok) {
                throw new BadRequestException(restoreResult.message);
            }

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

        return { orderId, status: "CONFIRMED", message: "Đã chấp nhận đơn thuê" };
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
        deposit_requirement,
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

        return items.map((item) => {
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

            if (product?.status !== "ACTIVE") {
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
            const unitPricePerDay = Number(variant.base_daily_rate || 0);
            const depositPerItem = Number(variant.deposit_requirement || 0);

            return {
                variantId: item.variantId,
                shopId: product?.shop_id || "",
                quantity: item.quantity,
                rentalStart: item.rentalStart,
                rentalEnd: item.rentalEnd,
                rentalDays,
                unitPricePerDay,
                depositPerItem,
                lineSubtotal: unitPricePerDay * rentalDays * item.quantity,
                lineDeposit: depositPerItem * item.quantity,
            };
        });
    }

    private calculateRentalDays(rentalStart: string, rentalEnd: string) {
        const start = new Date(rentalStart);
        const end = new Date(rentalEnd);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            throw new BadRequestException("Ngày thuê không hợp lệ");
        }

        if (end <= start) {
            throw new BadRequestException("Ngày trả phải sau ngày thuê");
        }

        return Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
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

    private mapVendorOrder(order: any, shopId: string) {
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

    private async restoreStockForOrder(orderId: string) {
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
                Number(variant.available_stock || 0) + Number(item.quantity || 0);

            const { error: updateStockError } = await supabase
                .from("product_variants")
                .update({ available_stock: nextStock })
                .eq("variant_id", item.variant_id);

            if (updateStockError) {
                return {
                    ok: false,
                    message: `Không thể hoàn tồn kho cho ${item.variant_id}`,
                };
            }
        }

        return {
            ok: true,
            message: "OK",
        };
    }

    private async rollbackOrder(orderId: string) {
        await this.supabaseService.client
            .from("rental_orders")
            .delete()
            .eq("order_id", orderId);
    }
}
