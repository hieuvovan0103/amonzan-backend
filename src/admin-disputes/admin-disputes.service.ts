import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";
import { NotificationsService } from "../modules/notifications/notifications.service";
import { ListDisputesQueryDto } from "./dto/list-disputes-query.dto";
import { RequestMoreEvidenceDto } from "./dto/request-more-evidence.dto";
import { ResolveDisputeDto } from "./dto/resolve-dispute.dto";

const DISPUTE_SELECT = `
    dispute_id,
    order_id,
    admin_id,
    reason,
    resolution,
    status,
    opened_at,
    resolved_at,
    dispute_type,
    evidence_urls,
    decision,
    admin_note,
    refund_amount,
    resolved_damage_fee,
    resolved_late_fee,
    evidence_request_target,
    evidence_request_message,
    evidence_requested_at,
    updated_at,
    complaints (
        complaint_id,
        title,
        description,
        status,
        created_at,
        created_by_user_id,
        complaint_type,
        evidence_urls,
        user_profiles (
            full_name,
            email,
            phone_number
        )
    ),
    dispute_events (
        event_id,
        actor_user_id,
        event_type,
        message,
        metadata,
        created_at,
        user_profiles (
            full_name,
            email
        )
    ),
    rental_orders (
        order_id,
        status,
        payment_status,
        rental_start,
        rental_end,
        subtotal,
        total_amount,
        deposit_amount,
        late_fee,
        damage_fee,
        shipping_fee,
        created_at,
        completed_at,
        pickup_return_records (
            return_requested_at,
            return_request_note,
            return_condition_status,
            return_evidence_urls,
            vendor_return_status,
            vendor_return_note,
            return_issue_reason,
            return_issue_description,
            return_issue_evidence_urls,
            returned_at,
            updated_at
        ),
        early_return_requests (
            request_id,
            status,
            reason,
            vendor_response_note,
            condition_image_urls,
            created_at
        ),
        renter_profiles (
            renter_profile_id,
            user_id,
            user_profiles (
                full_name,
                email,
                phone_number
            )
        ),
        rental_order_items (
            order_item_id,
            quantity,
            line_subtotal,
            line_deposit,
            product_variants (
                variant_name,
                products (
                    name,
                    shop_profiles (
                        shop_id,
                        shop_name,
                        user_id,
                        user_profiles (
                            full_name,
                            email,
                            phone_number
                        )
                    )
                )
            )
        )
    )
`;

@Injectable()
export class AdminDisputesService {
    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly notificationsService: NotificationsService,
    ) {}

    async listDisputes(authUserId: string | undefined, query: ListDisputesQueryDto) {
        await this.assertCurrentUserAdmin(authUserId);

        const { page, limit, from, to } = this.getPagination(query);
        let request = this.supabaseService.client
            .from("disputes")
            .select(DISPUTE_SELECT, { count: "exact" })
            .order("opened_at", { ascending: false })
            .range(from, to);

        if (query.status && query.status !== "ALL") {
            request = request.eq("status", query.status);
        }

        const { data, error, count } = await request;
        if (error) {
            throw new BadRequestException(`Không thể tải danh sách tranh chấp: ${error.message}`);
        }

        return {
            disputes: (data ?? []).map((dispute: any) => this.mapDispute(dispute, false)),
            pagination: this.mapPagination(page, limit, count ?? 0),
        };
    }

    async getDisputeDetail(authUserId: string | undefined, disputeId: string) {
        await this.assertCurrentUserAdmin(authUserId);

        const dispute = await this.getDisputeOrThrow(disputeId);
        return { dispute: this.mapDispute(dispute, true) };
    }

    async requestMoreEvidence(
        authUserId: string | undefined,
        disputeId: string,
        dto: RequestMoreEvidenceDto,
    ) {
        const { profile } = await this.assertCurrentUserAdmin(authUserId);
        const dispute = await this.getDisputeOrThrow(disputeId);

        if (["RESOLVED", "REJECTED"].includes(dispute.status)) {
            throw new BadRequestException("Tranh chấp đã kết thúc, không thể yêu cầu bổ sung bằng chứng");
        }

        const now = new Date().toISOString();
        const { error } = await this.supabaseService.client
            .from("disputes")
            .update({
                status: "NEED_MORE_EVIDENCE",
                evidence_request_target: dto.target,
                evidence_request_message: dto.message.trim(),
                evidence_requested_at: now,
                admin_note: dto.message.trim(),
                updated_at: now,
            })
            .eq("dispute_id", disputeId);

        if (error) {
            throw new BadRequestException(`Không thể yêu cầu bổ sung bằng chứng: ${error.message}`);
        }

        await this.createDisputeEvent(disputeId, profile.user_id, "REQUEST_EVIDENCE", dto.message.trim(), {
            target: dto.target,
        });

        const content = `Admin yêu cầu bổ sung bằng chứng cho đơn #${dispute.order_id.slice(0, 8)}: ${dto.message.trim()}`;
        if (dto.target === "RENTER" || dto.target === "BOTH") {
            const renterUserId = this.getRenterUserId(dispute);
            await this.createNotifications(
                renterUserId ? [renterUserId] : [],
                "DISPUTE_NEED_MORE_EVIDENCE",
                "Cần bổ sung bằng chứng tranh chấp",
                content,
                {
                    actionUrl: `/orders/${dispute.order_id}`,
                    relatedType: "DISPUTE",
                    relatedId: disputeId,
                },
            );
        }
        if (dto.target === "VENDOR" || dto.target === "BOTH") {
            await this.createNotifications(
                this.getVendorUserIds(dispute),
                "DISPUTE_NEED_MORE_EVIDENCE",
                "Cần bổ sung bằng chứng tranh chấp",
                content,
                {
                    actionUrl: `/dashboard/vendor/returns?orderId=${dispute.order_id}`,
                    relatedType: "DISPUTE",
                    relatedId: disputeId,
                },
            );
        }
        await this.createNotifications(
            await this.getAdminUserIds(),
            "DISPUTE_NEED_MORE_EVIDENCE",
            "Đã yêu cầu bổ sung bằng chứng",
            content,
            {
                actionUrl: `/dashboard/admin/disputes?disputeId=${disputeId}`,
                relatedType: "DISPUTE",
                relatedId: disputeId,
            },
        );

        return {
            disputeId,
            status: "NEED_MORE_EVIDENCE",
            message: "Đã yêu cầu bổ sung bằng chứng.",
        };
    }

    async resolveDispute(authUserId: string | undefined, disputeId: string, dto: ResolveDisputeDto) {
        const { profile, admin } = await this.assertCurrentUserAdmin(authUserId);
        const dispute = await this.getDisputeOrThrow(disputeId);

        if (["RESOLVED", "REJECTED"].includes(dispute.status)) {
            throw new BadRequestException("Tranh chấp này đã được xử lý");
        }

        const order = this.getOrder(dispute);
        if (!order) {
            throw new NotFoundException("Không tìm thấy đơn hàng của tranh chấp");
        }

        const refundAmount = Number(dto.refundAmount ?? dto.refund_amount ?? 0);
        const rawDamageFee = dto.damageFee ?? dto.damage_fee;
        const rawLateFee = dto.lateFee ?? dto.late_fee;
        const rawAdminNote = dto.adminNote ?? dto.admin_note;
        const damageFee = rawDamageFee === undefined ? undefined : Number(rawDamageFee);
        const lateFee = rawLateFee === undefined ? undefined : Number(rawLateFee);
        const now = new Date().toISOString();
        const finalDisputeStatus = "RESOLVED";
        const finalComplaintStatus = this.getComplaintStatusForDecision(dto.decision);

        const { error: disputeError } = await this.supabaseService.client
            .from("disputes")
            .update({
                admin_id: admin.admin_id,
                decision: dto.decision,
                resolution: dto.resolution.trim(),
                admin_note: rawAdminNote?.trim() || null,
                refund_amount: refundAmount,
                resolved_damage_fee: damageFee ?? null,
                resolved_late_fee: lateFee ?? null,
                status: finalDisputeStatus,
                resolved_at: now,
                updated_at: now,
            })
            .eq("dispute_id", disputeId);

        if (disputeError) {
            throw new BadRequestException(`Không thể cập nhật tranh chấp: ${disputeError.message}`);
        }

        const { error: complaintError } = await this.supabaseService.client
            .from("complaints")
            .update({ status: finalComplaintStatus })
            .eq("dispute_id", disputeId);

        if (complaintError) {
            throw new BadRequestException(`Không thể cập nhật khiếu nại: ${complaintError.message}`);
        }

        const orderUpdates: Record<string, any> = {
            status: "COMPLETED",
            completed_at: now,
        };
        if (damageFee !== undefined) orderUpdates.damage_fee = damageFee;
        if (lateFee !== undefined) orderUpdates.late_fee = lateFee;

        const { error: orderError } = await this.supabaseService.client
            .from("rental_orders")
            .update(orderUpdates)
            .eq("order_id", dispute.order_id);

        if (orderError) {
            throw new BadRequestException(`Không thể cập nhật đơn hàng: ${orderError.message}`);
        }

        if (refundAmount > 0) {
            const { error: refundError } = await this.supabaseService.client
                .from("refund_transactions")
                .insert({
                    order_id: dispute.order_id,
                    dispute_id: disputeId,
                    created_by_admin_id: admin.admin_id,
                    amount: refundAmount,
                    reason: dto.resolution.trim(),
                });

            if (refundError) {
                throw new BadRequestException(`Không thể tạo giao dịch hoàn tiền: ${refundError.message}`);
            }
        }

        await this.supabaseService.client
            .from("escrow_transactions")
            .update({
                dispute_id: disputeId,
                released_at: now,
                release_reason: this.getEscrowReleaseReason(dto),
            })
            .eq("order_id", dispute.order_id);

        await this.createDisputeEvent(disputeId, profile.user_id, "RESOLVE", dto.resolution.trim(), {
            decision: dto.decision,
            refundAmount,
            damageFee: damageFee ?? null,
            lateFee: lateFee ?? null,
            adminNote: rawAdminNote?.trim() || null,
        });

        const renterUserId = this.getRenterUserId(dispute);
        const vendorUserIds = this.getVendorUserIds(dispute);
        const resolvedContent = `Admin đã đưa ra quyết định cuối cùng cho đơn #${dispute.order_id.slice(0, 8)}.`;
        await this.createNotifications(
            renterUserId ? [renterUserId] : [],
            "DISPUTE_RESOLVED",
            "Tranh chấp đã được xử lý",
            resolvedContent,
            {
                actionUrl: `/orders/${dispute.order_id}`,
                relatedType: "DISPUTE",
                relatedId: disputeId,
            },
        );
        await this.createNotifications(
            vendorUserIds,
            "DISPUTE_RESOLVED",
            "Tranh chấp đã được xử lý",
            resolvedContent,
            {
                actionUrl: `/dashboard/vendor/returns?orderId=${dispute.order_id}`,
                relatedType: "DISPUTE",
                relatedId: disputeId,
            },
        );
        await this.createNotifications(
            await this.getAdminUserIds(),
            "DISPUTE_RESOLVED",
            "Tranh chấp đã được xử lý",
            resolvedContent,
            {
                actionUrl: `/dashboard/admin/disputes?disputeId=${disputeId}`,
                relatedType: "DISPUTE",
                relatedId: disputeId,
            },
        );

        return {
            disputeId,
            orderId: dispute.order_id,
            status: finalDisputeStatus,
            message: "Đã xử lý tranh chấp.",
        };
    }

    private async assertCurrentUserAdmin(authUserId: string | undefined) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập bằng tài khoản admin");
        }

        const profile = await this.getUserProfile(authUserId);
        const { data: admin, error } = await this.supabaseService.client
            .from("admin_profiles")
            .select("admin_id, user_id")
            .eq("user_id", profile.user_id)
            .maybeSingle();

        if (error || !admin) {
            throw new ForbiddenException("Bạn không có quyền admin");
        }

        return { profile, admin };
    }

    private async getUserProfile(authUserId: string) {
        const { data, error } = await this.supabaseService.client
            .from("user_profiles")
            .select("user_id, auth_user_id, full_name, email, phone_number")
            .eq("auth_user_id", authUserId)
            .single();

        if (error || !data) {
            throw new NotFoundException("Không tìm thấy hồ sơ người dùng");
        }

        return data;
    }

    private async getDisputeOrThrow(disputeId: string) {
        const { data, error } = await this.supabaseService.client
            .from("disputes")
            .select(DISPUTE_SELECT)
            .eq("dispute_id", disputeId)
            .single();

        if (error || !data) {
            throw new NotFoundException("Không tìm thấy tranh chấp");
        }

        return data as any;
    }

    private getOrder(dispute: any) {
        return Array.isArray(dispute.rental_orders)
            ? dispute.rental_orders[0]
            : dispute.rental_orders;
    }

    private getRenterUserId(dispute: any) {
        const order = this.getOrder(dispute);
        const renterProfile = Array.isArray(order?.renter_profiles)
            ? order.renter_profiles[0]
            : order?.renter_profiles;

        return renterProfile?.user_id as string | undefined;
    }

    private getVendorUserIds(dispute: any) {
        const order = this.getOrder(dispute);
        return [
            ...new Set(
                (order?.rental_order_items ?? []).flatMap((item: any) => {
                    const variant = Array.isArray(item.product_variants)
                        ? item.product_variants[0]
                        : item.product_variants;
                    const product = Array.isArray(variant?.products)
                        ? variant.products[0]
                        : variant?.products;
                    const shop = Array.isArray(product?.shop_profiles)
                        ? product.shop_profiles[0]
                        : product?.shop_profiles;
                    return shop?.user_id ? [shop.user_id] : [];
                }),
            ),
        ] as string[];
    }

    private async getAdminUserIds() {
        const { data, error } = await this.supabaseService.client
            .from("admin_profiles")
            .select("user_id");

        if (error) return [];

        return (data ?? []).map((admin) => admin.user_id as string);
    }

    private getComplaintStatusForDecision(decision: string) {
        return ["NO_REFUND", "RELEASE_TO_VENDOR", "DEDUCT_DEPOSIT"].includes(decision)
            ? "REJECTED"
            : "RESOLVED";
    }

    private getEscrowReleaseReason(dto: ResolveDisputeDto) {
        const refundAmount = dto.refundAmount ?? dto.refund_amount;
        const damageFee = dto.damageFee ?? dto.damage_fee;
        const lateFee = dto.lateFee ?? dto.late_fee;

        return [
            `Admin dispute decision: ${dto.decision}`,
            refundAmount ? `refund=${refundAmount}` : null,
            damageFee !== undefined ? `damage_fee=${damageFee}` : null,
            lateFee !== undefined ? `late_fee=${lateFee}` : null,
        ]
            .filter(Boolean)
            .join("; ");
    }

    private async createDisputeEvent(
        disputeId: string,
        actorUserId: string,
        eventType: string,
        message: string,
        metadata: Record<string, any>,
    ) {
        await this.supabaseService.client.from("dispute_events").insert({
            dispute_id: disputeId,
            actor_user_id: actorUserId,
            event_type: eventType,
            message,
            metadata,
        });
    }

    private async createNotifications(
        userIds: string[],
        type: string,
        title: string,
        content: string,
        options?: {
            actionUrl?: string;
            relatedType?: string;
            relatedId?: string;
        },
    ) {
        await this.notificationsService.notifyUsers(userIds, {
            type,
            title,
            content,
            actionUrl: options?.actionUrl,
            relatedType: options?.relatedType,
            relatedId: options?.relatedId,
        });
    }

    private mapDispute(dispute: any, includeDetail: boolean) {
        const order = this.getOrder(dispute);
        const renterProfile = Array.isArray(order?.renter_profiles)
            ? order.renter_profiles[0]
            : order?.renter_profiles;
        const renterUser = Array.isArray(renterProfile?.user_profiles)
            ? renterProfile.user_profiles[0]
            : renterProfile?.user_profiles;
        const complaints = [...(dispute.complaints ?? [])].sort(
            (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        const complaint = complaints[0] ?? null;
        const complainant = Array.isArray(complaint?.user_profiles)
            ? complaint.user_profiles[0]
            : complaint?.user_profiles;
        const record = Array.isArray(order?.pickup_return_records)
            ? order.pickup_return_records[0]
            : order?.pickup_return_records;
        const earlyReturnRequests = [...(order?.early_return_requests ?? [])].sort(
            (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        const earlyReturnRequest = earlyReturnRequests[0] ?? null;

        const items = (order?.rental_order_items ?? []).map((item: any) => {
            const variant = Array.isArray(item.product_variants)
                ? item.product_variants[0]
                : item.product_variants;
            const product = Array.isArray(variant?.products)
                ? variant.products[0]
                : variant?.products;
            const shop = Array.isArray(product?.shop_profiles)
                ? product.shop_profiles[0]
                : product?.shop_profiles;
            const shopUser = Array.isArray(shop?.user_profiles)
                ? shop.user_profiles[0]
                : shop?.user_profiles;

            return {
                orderItemId: item.order_item_id,
                productName: product?.name ?? "Sản phẩm",
                variantName: variant?.variant_name ?? null,
                quantity: Number(item.quantity || 0),
                lineSubtotal: Number(item.line_subtotal || 0),
                lineDeposit: Number(item.line_deposit || 0),
                shopName: shop?.shop_name ?? null,
                shopOwnerName: shopUser?.full_name ?? null,
            };
        });
        const firstShop = items.find((item: any) => item.shopName || item.shopOwnerName);

        const renterEvidenceUrls = [
            ...(Array.isArray(complaint?.evidence_urls) ? complaint.evidence_urls : []),
            ...(Array.isArray(dispute.evidence_urls) ? dispute.evidence_urls : []),
            ...(Array.isArray(record?.return_evidence_urls) ? record.return_evidence_urls : []),
            ...(Array.isArray(earlyReturnRequest?.condition_image_urls)
                ? earlyReturnRequest.condition_image_urls
                : []),
        ].filter(Boolean);
        const vendorEvidenceUrls = [
            ...(Array.isArray(record?.return_issue_evidence_urls)
                ? record.return_issue_evidence_urls
                : []),
        ].filter(Boolean);

        const base = {
            disputeId: dispute.dispute_id,
            orderId: dispute.order_id,
            type: dispute.dispute_type,
            reason: dispute.reason,
            resolution: dispute.resolution,
            status: dispute.status,
            decision: dispute.decision,
            adminNote: dispute.admin_note,
            refundAmount: Number(dispute.refund_amount ?? 0),
            resolvedDamageFee:
                dispute.resolved_damage_fee === null || dispute.resolved_damage_fee === undefined
                    ? null
                    : Number(dispute.resolved_damage_fee),
            resolvedLateFee:
                dispute.resolved_late_fee === null || dispute.resolved_late_fee === undefined
                    ? null
                    : Number(dispute.resolved_late_fee),
            evidenceRequestTarget: dispute.evidence_request_target,
            evidenceRequestMessage: dispute.evidence_request_message,
            evidenceRequestedAt: dispute.evidence_requested_at,
            evidenceUrls: [...new Set([...renterEvidenceUrls, ...vendorEvidenceUrls])],
            renterEvidenceUrls: [...new Set(renterEvidenceUrls)],
            vendorEvidenceUrls: [...new Set(vendorEvidenceUrls)],
            openedAt: dispute.opened_at,
            resolvedAt: dispute.resolved_at,
            complaint: complaint
                ? {
                      complaintId: complaint.complaint_id,
                      title: complaint.title,
                      description: complaint.description,
                      status: complaint.status,
                      type: complaint.complaint_type,
                      evidenceUrls: Array.isArray(complaint.evidence_urls)
                          ? complaint.evidence_urls
                          : [],
                      createdAt: complaint.created_at,
                      complainantName: complainant?.full_name ?? renterUser?.full_name ?? "Người thuê",
                      complainantEmail: complainant?.email ?? renterUser?.email ?? null,
                      complainantPhone: complainant?.phone_number ?? renterUser?.phone_number ?? null,
                  }
                : null,
            order: {
                status: order?.status,
                paymentStatus: order?.payment_status,
                rentalStart: order?.rental_start,
                rentalEnd: order?.rental_end,
                subtotal: Number(order?.subtotal ?? 0),
                totalAmount: Number(order?.total_amount ?? 0),
                depositAmount: Number(order?.deposit_amount ?? 0),
                shippingFee: Number(order?.shipping_fee ?? 0),
                lateFee: Number(order?.late_fee ?? 0),
                damageFee: Number(order?.damage_fee ?? 0),
                createdAt: order?.created_at,
                completedAt: order?.completed_at,
            },
            renter: {
                fullName: renterUser?.full_name ?? "Người thuê",
                email: renterUser?.email ?? null,
                phoneNumber: renterUser?.phone_number ?? null,
            },
            shop: {
                name: firstShop?.shopName ?? "Shop",
                ownerName: firstShop?.shopOwnerName ?? null,
            },
            items,
        };

        if (!includeDetail) return base;

        return {
            ...base,
            returnRecord: record
                ? {
                      returnRequestedAt: record.return_requested_at,
                      returnRequestNote: record.return_request_note,
                      returnConditionStatus: record.return_condition_status,
                      vendorReturnStatus: record.vendor_return_status,
                      vendorReturnNote: record.vendor_return_note,
                      returnIssueReason: record.return_issue_reason,
                      returnIssueDescription: record.return_issue_description,
                      returnedAt: record.returned_at,
                      updatedAt: record.updated_at,
                  }
                : null,
            earlyReturnRequest: earlyReturnRequest
                ? {
                      requestId: earlyReturnRequest.request_id,
                      status: earlyReturnRequest.status,
                      reason: earlyReturnRequest.reason,
                      vendorResponseNote: earlyReturnRequest.vendor_response_note,
                      conditionImageUrls: Array.isArray(earlyReturnRequest.condition_image_urls)
                          ? earlyReturnRequest.condition_image_urls
                          : [],
                      createdAt: earlyReturnRequest.created_at,
                  }
                : null,
            timeline: [...(dispute.dispute_events ?? [])]
                .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                .map((event: any) => {
                    const actor = Array.isArray(event.user_profiles)
                        ? event.user_profiles[0]
                        : event.user_profiles;
                    return {
                        eventId: event.event_id,
                        actorName: actor?.full_name ?? "Hệ thống",
                        eventType: event.event_type,
                        message: event.message,
                        metadata: event.metadata ?? {},
                        createdAt: event.created_at,
                    };
                }),
        };
    }

    private getPagination(query: ListDisputesQueryDto) {
        const page = Math.max(1, Number(query.page || 1));
        const limit = Math.min(50, Math.max(1, Number(query.limit || 20)));
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        return { page, limit, from, to };
    }

    private mapPagination(page: number, limit: number, total: number) {
        return {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        };
    }
}
