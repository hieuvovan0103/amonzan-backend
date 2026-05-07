import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";
import { NotificationsService } from "../modules/notifications/notifications.service";
import { CreateReturnComplaintDto } from "./dto/create-return-complaint.dto";
import { CreateReturnRequestDto } from "./dto/create-return-request.dto";
import { ResolveReturnDisputeDto } from "./dto/resolve-return-dispute.dto";
import { VendorConfirmReturnDto } from "./dto/vendor-confirm-return.dto";
import { VendorReportReturnIssueDto } from "./dto/vendor-report-return-issue.dto";

type PaginationQuery = {
    status?: string;
    page?: string;
    limit?: string;
};

@Injectable()
export class ReturnsService {
    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly notificationsService: NotificationsService,
    ) {}

    async createReturnRequest(
        authUserId: string | undefined,
        orderId: string,
        dto: CreateReturnRequestDto,
    ) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để yêu cầu hoàn trả");
        }

        const supabase = this.supabaseService.client;
        const userProfile = await this.getUserProfile(authUserId);
        const renterProfile = await this.getRenterProfile(userProfile.user_id);
        const order = await this.getOrder(orderId);

        if (order.renter_profile_id !== renterProfile.renter_profile_id) {
            throw new ForbiddenException("Bạn không có quyền thao tác với đơn thuê này");
        }

        if (!["IN_RENTAL", "LATE"].includes(order.status)) {
            throw new BadRequestException("Chỉ đơn đang thuê hoặc quá hạn mới có thể yêu cầu hoàn trả");
        }

        const now = new Date().toISOString();
        await this.upsertPickupReturnRecord(orderId, {
            return_requested_at: now,
            return_request_note: dto.note?.trim() || null,
            return_condition_status: dto.conditionStatus ?? null,
            return_evidence_urls: dto.evidenceUrls ?? [],
            vendor_return_status: "PENDING",
            updated_at: now,
        });

        const { error: orderError } = await supabase
            .from("rental_orders")
            .update({ status: "RETURN_PENDING" })
            .eq("order_id", orderId);

        if (orderError) {
            throw new BadRequestException(`Không thể cập nhật trạng thái đơn: ${orderError.message}`);
        }

        const vendorUserIds = await this.getOrderVendorUserIds(orderId);
        await this.createNotifications(
            vendorUserIds,
            "RETURN_REQUEST_CREATED",
            "Có yêu cầu hoàn trả mới",
            `Người thuê đã gửi yêu cầu hoàn trả cho đơn #${orderId.slice(0, 8)}.`,
            {
                actionUrl: `/dashboard/vendor/returns?orderId=${orderId}`,
                relatedType: "RETURN_REQUEST",
                relatedId: orderId,
            },
        );
        await this.createNotifications(
            [userProfile.user_id],
            "RETURN_REQUEST_CREATED",
            "Đã gửi yêu cầu hoàn trả",
            `Yêu cầu hoàn trả cho đơn #${orderId.slice(0, 8)} đã được gửi đến shop.`,
            {
                actionUrl: `/orders/${orderId}`,
                relatedType: "ORDER",
                relatedId: orderId,
            },
        );

        return {
            orderId,
            status: "RETURN_PENDING",
            message: "Đã gửi yêu cầu hoàn trả.",
        };
    }

    async getMyReturnRequests(authUserId: string | undefined, query: PaginationQuery) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để xem yêu cầu hoàn trả");
        }

        const userProfile = await this.getUserProfile(authUserId);
        const renterProfile = await this.getRenterProfile(userProfile.user_id);
        const { from, to, page, limit } = this.getPagination(query);

        let request = this.supabaseService.client
            .from("rental_orders")
            .select(this.returnOrderSelect(), { count: "exact" })
            .eq("renter_profile_id", renterProfile.renter_profile_id)
            .in("status", ["RETURN_PENDING", "COMPLETED", "DISPUTED"])
            .not("pickup_return_records.return_requested_at", "is", null)
            .order("created_at", { ascending: false })
            .range(from, to);

        if (query.status && query.status !== "ALL") {
            request = request.eq("status", query.status);
        }

        const { data, error, count } = await request;

        if (error) {
            throw new BadRequestException(`Không thể tải yêu cầu hoàn trả: ${error.message}`);
        }

        return {
            requests: (data ?? []).map((order: any) => this.mapReturnRequest(order)),
            pagination: this.mapPagination(page, limit, count ?? 0),
        };
    }

    async getVendorReturnRequests(authUserId: string | undefined, query: PaginationQuery) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để xem yêu cầu hoàn trả");
        }

        const shop = await this.getVendorShop(authUserId);
        const orderIds = await this.getShopOrderIds(shop.shop_id);
        const { page, limit } = this.getPagination(query);

        if (orderIds.length === 0) {
            return { requests: [], pagination: this.mapPagination(page, limit, 0) };
        }

        let request = this.supabaseService.client
            .from("rental_orders")
            .select(this.returnOrderSelect(), { count: "exact" })
            .in("order_id", orderIds)
            .in("status", ["RETURN_PENDING", "COMPLETED", "DISPUTED"])
            .not("pickup_return_records.return_requested_at", "is", null)
            .order("created_at", { ascending: false });

        if (query.status && query.status !== "ALL") {
            request = request.eq("status", query.status);
        }

        const { data, error, count } = await request;

        if (error) {
            throw new BadRequestException(`Không thể tải yêu cầu hoàn trả của shop: ${error.message}`);
        }

        return {
            requests: (data ?? []).map((order: any) => this.mapReturnRequest(order, shop.shop_id)),
            pagination: this.mapPagination(page, limit, count ?? 0),
        };
    }

    async getReturnRequestDetail(authUserId: string | undefined, orderId: string) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để xem yêu cầu hoàn trả");
        }

        const { data, error } = await this.supabaseService.client
            .from("rental_orders")
            .select(this.returnOrderSelect())
            .eq("order_id", orderId)
            .single();

        if (error || !data) {
            throw new NotFoundException("Không tìm thấy yêu cầu hoàn trả");
        }

        await this.assertCanViewOrder(authUserId, data);

        return { request: this.mapReturnRequest(data) };
    }

    async confirmReturn(
        authUserId: string | undefined,
        orderId: string,
        dto: VendorConfirmReturnDto,
    ) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để xác nhận hoàn trả");
        }

        await this.assertVendorOwnsOrder(authUserId, orderId);
        const order = await this.getOrder(orderId);

        if (order.status !== "RETURN_PENDING") {
            throw new BadRequestException("Chỉ yêu cầu hoàn trả đang chờ mới có thể xác nhận");
        }

        const returnedAt = dto.returnedAt || new Date().toISOString();
        await this.upsertPickupReturnRecord(orderId, {
            returned_at: returnedAt,
            vendor_return_status: "CONFIRMED",
            vendor_return_note: dto.note?.trim() || null,
            return_condition_note: dto.note?.trim() || null,
            updated_at: new Date().toISOString(),
        });

        const { error } = await this.supabaseService.client
            .from("rental_orders")
            .update({
                status: "COMPLETED",
                completed_at: returnedAt,
            })
            .eq("order_id", orderId);

        if (error) {
            throw new BadRequestException(`Không thể hoàn tất đơn hoàn trả: ${error.message}`);
        }

        const renterUserId = await this.getOrderRenterUserId(orderId);
        await this.createNotifications(
            [renterUserId],
            "RETURN_CONFIRMED",
            "Hoàn trả thành công",
            `Shop đã xác nhận nhận hàng hoàn trả cho đơn #${orderId.slice(0, 8)}.`,
            {
                actionUrl: `/orders/${orderId}`,
                relatedType: "ORDER",
                relatedId: orderId,
            },
        );
        await this.createNotifications(
            await this.getOrderVendorUserIds(orderId),
            "RETURN_CONFIRMED",
            "Hoàn trả đã được xác nhận",
            `Shop đã xác nhận nhận hàng hoàn trả cho đơn #${orderId.slice(0, 8)}.`,
            {
                actionUrl: `/dashboard/vendor/returns?orderId=${orderId}`,
                relatedType: "ORDER",
                relatedId: orderId,
            },
        );

        return { orderId, status: "COMPLETED", message: "Đã xác nhận hoàn trả thành công." };
    }

    async reportReturnIssue(
        authUserId: string | undefined,
        orderId: string,
        dto: VendorReportReturnIssueDto,
    ) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để báo vấn đề hoàn trả");
        }

        await this.assertVendorOwnsOrder(authUserId, orderId);
        const order = await this.getOrder(orderId);

        if (order.status !== "RETURN_PENDING") {
            throw new BadRequestException("Chỉ yêu cầu hoàn trả đang chờ mới có thể báo vấn đề");
        }

        const now = new Date().toISOString();
        await this.upsertPickupReturnRecord(orderId, {
            vendor_return_status: "ISSUE_REPORTED",
            vendor_return_note: dto.issueDescription?.trim() || dto.issueReason.trim(),
            return_issue_reason: dto.issueReason.trim(),
            return_issue_description: dto.issueDescription?.trim() || null,
            return_issue_evidence_urls: dto.evidenceUrls ?? [],
            updated_at: now,
        });

        const { error } = await this.supabaseService.client
            .from("rental_orders")
            .update({
                status: "DISPUTED",
                damage_fee: Number(dto.damageFee ?? 0),
                late_fee: Number(dto.lateFee ?? 0),
            })
            .eq("order_id", orderId);

        if (error) {
            throw new BadRequestException(`Không thể cập nhật vấn đề hoàn trả: ${error.message}`);
        }

        const renterUserId = await this.getOrderRenterUserId(orderId);
        await this.createNotifications(
            [renterUserId],
            "RETURN_REPORTED_ISSUE",
            "Shop báo có vấn đề khi hoàn trả",
            `Shop đã báo vấn đề với đơn #${orderId.slice(0, 8)}. Bạn có thể xem kết quả và khiếu nại nếu không đồng ý.`,
            {
                actionUrl: `/orders/${orderId}`,
                relatedType: "ORDER",
                relatedId: orderId,
            },
        );
        await this.createNotifications(
            await this.getOrderVendorUserIds(orderId),
            "RETURN_REPORTED_ISSUE",
            "Shop báo vấn đề hoàn trả",
            `Shop đã báo vấn đề với đơn #${orderId.slice(0, 8)}.`,
            {
                actionUrl: `/dashboard/vendor/returns?orderId=${orderId}`,
                relatedType: "ORDER",
                relatedId: orderId,
            },
        );

        return { orderId, status: "DISPUTED", message: "Đã ghi nhận vấn đề hoàn trả." };
    }

    async createReturnComplaint(
        authUserId: string | undefined,
        orderId: string,
        dto: CreateReturnComplaintDto,
    ) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để gửi khiếu nại");
        }

        const supabase = this.supabaseService.client;
        const userProfile = await this.getUserProfile(authUserId);
        const renterProfile = await this.getRenterProfile(userProfile.user_id);
        const order = await this.getOrder(orderId);

        if (order.renter_profile_id !== renterProfile.renter_profile_id) {
            throw new ForbiddenException("Bạn không có quyền khiếu nại đơn thuê này");
        }

        if (!["COMPLETED", "DISPUTED"].includes(order.status)) {
            throw new BadRequestException("Chỉ có thể khiếu nại sau khi vendor đã xử lý hoàn trả");
        }

        const { data: dispute, error: disputeError } = await supabase
            .from("disputes")
            .upsert(
                {
                    order_id: orderId,
                    reason: dto.description?.trim() || dto.title.trim(),
                    status: "OPEN",
                    dispute_type: "RETURN_DISPUTE",
                    evidence_urls: dto.evidenceUrls ?? [],
                },
                { onConflict: "order_id" },
            )
            .select("*")
            .single();

        if (disputeError || !dispute) {
            throw new BadRequestException(`Không thể tạo tranh chấp: ${disputeError?.message || "Unknown error"}`);
        }

        const { data: complaint, error: complaintError } = await supabase
            .from("complaints")
            .insert({
                order_id: orderId,
                title: dto.title.trim(),
                description: dto.description?.trim() || null,
                status: "OPEN",
                created_by_user_id: userProfile.user_id,
                complaint_type: "RETURN_RESULT",
                evidence_urls: dto.evidenceUrls ?? [],
                dispute_id: dispute.dispute_id,
            })
            .select("*")
            .single();

        if (complaintError || !complaint) {
            throw new BadRequestException(`Không thể tạo khiếu nại: ${complaintError?.message || "Unknown error"}`);
        }

        await supabase.from("rental_orders").update({ status: "DISPUTED" }).eq("order_id", orderId);
        const adminUserIds = await this.getAdminUserIds();
        await this.createNotifications(
            adminUserIds,
            "RETURN_COMPLAINT_CREATED",
            "Có khiếu nại hoàn trả mới",
            `Người thuê đã gửi khiếu nại kết quả hoàn trả cho đơn #${orderId.slice(0, 8)}.`,
            {
                actionUrl: `/dashboard/admin/disputes?disputeId=${dispute.dispute_id}`,
                relatedType: "DISPUTE",
                relatedId: dispute.dispute_id,
            },
        );
        await this.createNotifications(
            [userProfile.user_id],
            "RETURN_COMPLAINT_CREATED",
            "Khiếu nại hoàn trả đã được ghi nhận",
            `Khiếu nại hoàn trả cho đơn #${orderId.slice(0, 8)} đã được gửi đến admin xử lý.`,
            {
                actionUrl: `/orders/${orderId}`,
                relatedType: "DISPUTE",
                relatedId: dispute.dispute_id,
            },
        );
        await this.createNotifications(
            await this.getOrderVendorUserIds(orderId),
            "RETURN_COMPLAINT_CREATED",
            "Có khiếu nại hoàn trả mới",
            `Người thuê đã gửi khiếu nại hoàn trả cho đơn #${orderId.slice(0, 8)}.`,
            {
                actionUrl: `/dashboard/vendor/returns?orderId=${orderId}`,
                relatedType: "DISPUTE",
                relatedId: dispute.dispute_id,
            },
        );

        return {
            complaintId: complaint.complaint_id,
            disputeId: dispute.dispute_id,
            status: "OPEN",
            message: "Đã gửi khiếu nại kết quả hoàn trả.",
        };
    }

    async createEarlyReturnComplaint(
        authUserId: string | undefined,
        orderId: string,
        dto: CreateReturnComplaintDto,
    ) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để gửi khiếu nại");
        }

        const supabase = this.supabaseService.client;
        const userProfile = await this.getUserProfile(authUserId);
        const renterProfile = await this.getRenterProfile(userProfile.user_id);
        const order = await this.getOrder(orderId);

        if (order.renter_profile_id !== renterProfile.renter_profile_id) {
            throw new ForbiddenException("Bạn không có quyền khiếu nại đơn thuê này");
        }

        const { data: rejectedRequest, error: requestError } = await supabase
            .from("early_return_requests")
            .select("request_id, status, vendor_response_note")
            .eq("order_id", orderId)
            .eq("status", "REJECTED")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (requestError) {
            throw new BadRequestException(`Không thể kiểm tra yêu cầu trả sớm: ${requestError.message}`);
        }

        if (!rejectedRequest) {
            throw new BadRequestException("Chỉ có thể khiếu nại khi shop đã từ chối yêu cầu trả hàng sớm");
        }

        const { data: dispute, error: disputeError } = await supabase
            .from("disputes")
            .upsert(
                {
                    order_id: orderId,
                    reason: dto.description?.trim() || dto.title.trim(),
                    status: "OPEN",
                    dispute_type: "EARLY_RETURN_DISPUTE",
                    evidence_urls: dto.evidenceUrls ?? [],
                },
                { onConflict: "order_id" },
            )
            .select("*")
            .single();

        if (disputeError || !dispute) {
            throw new BadRequestException(`Không thể tạo tranh chấp: ${disputeError?.message || "Unknown error"}`);
        }

        const { data: complaint, error: complaintError } = await supabase
            .from("complaints")
            .insert({
                order_id: orderId,
                title: dto.title.trim(),
                description: [
                    dto.description?.trim(),
                    rejectedRequest.vendor_response_note
                        ? `Lý do shop từ chối trả sớm: ${rejectedRequest.vendor_response_note}`
                        : null,
                ]
                    .filter(Boolean)
                    .join("\n\n"),
                status: "OPEN",
                created_by_user_id: userProfile.user_id,
                complaint_type: "EARLY_RETURN_REJECTION",
                evidence_urls: dto.evidenceUrls ?? [],
                dispute_id: dispute.dispute_id,
            })
            .select("*")
            .single();

        if (complaintError || !complaint) {
            throw new BadRequestException(`Không thể tạo khiếu nại: ${complaintError?.message || "Unknown error"}`);
        }

        await supabase.from("rental_orders").update({ status: "DISPUTED" }).eq("order_id", orderId);
        const adminUserIds = await this.getAdminUserIds();
        await this.createNotifications(
            adminUserIds,
            "RETURN_COMPLAINT_CREATED",
            "Có khiếu nại trả hàng sớm mới",
            `Người thuê đã khiếu nại việc shop từ chối trả hàng sớm cho đơn #${orderId.slice(0, 8)}.`,
            {
                actionUrl: `/dashboard/admin/disputes?disputeId=${dispute.dispute_id}`,
                relatedType: "DISPUTE",
                relatedId: dispute.dispute_id,
            },
        );
        await this.createNotifications(
            [userProfile.user_id],
            "RETURN_COMPLAINT_CREATED",
            "Khiếu nại trả hàng sớm đã được ghi nhận",
            `Khiếu nại trả hàng sớm cho đơn #${orderId.slice(0, 8)} đã được gửi đến admin xử lý.`,
            {
                actionUrl: `/orders/${orderId}`,
                relatedType: "DISPUTE",
                relatedId: dispute.dispute_id,
            },
        );
        await this.createNotifications(
            await this.getOrderVendorUserIds(orderId),
            "RETURN_COMPLAINT_CREATED",
            "Có khiếu nại trả hàng sớm mới",
            `Người thuê đã khiếu nại việc shop từ chối trả hàng sớm cho đơn #${orderId.slice(0, 8)}.`,
            {
                actionUrl: `/dashboard/vendor/returns?orderId=${orderId}`,
                relatedType: "DISPUTE",
                relatedId: dispute.dispute_id,
            },
        );

        return {
            complaintId: complaint.complaint_id,
            disputeId: dispute.dispute_id,
            status: "OPEN",
            message: "Đã gửi khiếu nại từ chối trả hàng sớm.",
        };
    }

    async getAdminReturnDisputes(authUserId: string | undefined) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để xem tranh chấp");
        }

        const profile = await this.getUserProfile(authUserId);
        await this.assertAdmin(profile.user_id);

        const { data, error } = await this.supabaseService.client
            .from("disputes")
            .select(
                `
                dispute_id,
                order_id,
                reason,
                resolution,
                status,
                dispute_type,
                evidence_urls,
                opened_at,
                resolved_at,
                complaints (
                    complaint_id,
                    title,
                    description,
                    status,
                    complaint_type,
                    evidence_urls,
                    created_at,
                    created_by_user_id,
                    user_profiles (
                        full_name,
                        email,
                        phone_number
                    )
                ),
                rental_orders (
                    order_id,
                    status,
                    payment_status,
                    rental_start,
                    rental_end,
                    total_amount,
                    late_fee,
                    damage_fee,
                    pickup_return_records (
                        return_evidence_urls,
                        return_issue_evidence_urls
                    ),
                    early_return_requests (
                        condition_image_urls,
                        created_at
                    ),
                    renter_profiles (
                        user_profiles (
                            full_name,
                            email,
                            phone_number
                        )
                    ),
                    rental_order_items (
                        quantity,
                        product_variants (
                            variant_name,
                            products (
                                name,
                                shop_profiles (
                                    shop_id,
                                    shop_name,
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
            `,
            )
            .in("dispute_type", ["RETURN_DISPUTE", "EARLY_RETURN_DISPUTE"])
            .order("opened_at", { ascending: false });

        if (error) {
            throw new BadRequestException(`Không thể tải tranh chấp hoàn trả: ${error.message}`);
        }

        return {
            disputes: (data ?? []).map((dispute: any) => this.mapAdminReturnDispute(dispute)),
        };
    }

    async resolveAdminReturnDispute(
        authUserId: string | undefined,
        disputeId: string,
        dto: ResolveReturnDisputeDto,
    ) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để xử lý tranh chấp");
        }

        const profile = await this.getUserProfile(authUserId);
        const admin = await this.assertAdmin(profile.user_id);
        const resolution = dto.resolution.trim();

        const { data: dispute, error: disputeError } = await this.supabaseService.client
            .from("disputes")
            .select("dispute_id, order_id, status, dispute_type")
            .eq("dispute_id", disputeId)
            .in("dispute_type", ["RETURN_DISPUTE", "EARLY_RETURN_DISPUTE"])
            .single();

        if (disputeError || !dispute) {
            throw new NotFoundException("Không tìm thấy tranh chấp hoàn trả");
        }

        if (dispute.status === "RESOLVED") {
            throw new BadRequestException("Tranh chấp này đã được xử lý");
        }

        const now = new Date().toISOString();
        const { error: updateError } = await this.supabaseService.client
            .from("disputes")
            .update({
                admin_id: admin.admin_id,
                resolution,
                status: "RESOLVED",
                resolved_at: now,
            })
            .eq("dispute_id", disputeId);

        if (updateError) {
            throw new BadRequestException(`Không thể xử lý tranh chấp: ${updateError.message}`);
        }

        const { error: complaintError } = await this.supabaseService.client
            .from("complaints")
            .update({ status: "RESOLVED" })
            .eq("dispute_id", disputeId);

        if (complaintError) {
            throw new BadRequestException(`Không thể cập nhật khiếu nại: ${complaintError.message}`);
        }

        await this.createNotifications(
            [await this.getOrderRenterUserId(dispute.order_id)],
            "DISPUTE_RESOLVED",
            "Tranh chấp đã được xử lý",
            `Admin đã xử lý tranh chấp cho đơn #${dispute.order_id.slice(0, 8)}.`,
            {
                actionUrl: `/orders/${dispute.order_id}`,
                relatedType: "DISPUTE",
                relatedId: disputeId,
            },
        );
        await this.createNotifications(
            await this.getOrderVendorUserIds(dispute.order_id),
            "DISPUTE_RESOLVED",
            "Tranh chấp đã được xử lý",
            `Admin đã xử lý tranh chấp cho đơn #${dispute.order_id.slice(0, 8)}.`,
            {
                actionUrl: `/dashboard/vendor/returns?orderId=${dispute.order_id}`,
                relatedType: "DISPUTE",
                relatedId: disputeId,
            },
        );

        return {
            disputeId,
            orderId: dispute.order_id,
            status: "RESOLVED",
            resolvedAt: now,
            message: "Đã xử lý tranh chấp.",
        };
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

    private async assertAdmin(userId: string) {
        const { data, error } = await this.supabaseService.client
            .from("admin_profiles")
            .select("admin_id")
            .eq("user_id", userId)
            .maybeSingle();

        if (error || !data) {
            throw new ForbiddenException("Bạn không có quyền admin");
        }

        return data;
    }

    private async getRenterProfile(userId: string) {
        const { data, error } = await this.supabaseService.client
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
        const profile = await this.getUserProfile(authUserId);
        const { data, error } = await this.supabaseService.client
            .from("shop_profiles")
            .select("shop_id, shop_name, user_id")
            .eq("user_id", profile.user_id)
            .single();

        if (error || !data) {
            throw new NotFoundException("Không tìm thấy shop của tài khoản này");
        }

        return data;
    }

    private async getOrder(orderId: string) {
        const { data, error } = await this.supabaseService.client
            .from("rental_orders")
            .select("order_id, renter_profile_id, status, payment_status, rental_start, rental_end, late_fee, damage_fee")
            .eq("order_id", orderId)
            .single();

        if (error || !data) {
            throw new NotFoundException("Không tìm thấy đơn thuê");
        }

        return data;
    }

    private async getOrderRenterUserId(orderId: string) {
        const { data, error } = await this.supabaseService.client
            .from("rental_orders")
            .select("renter_profiles!inner(user_id)")
            .eq("order_id", orderId)
            .single();

        if (error || !data) {
            throw new NotFoundException("Không tìm thấy người thuê của đơn");
        }

        const renter = Array.isArray(data.renter_profiles)
            ? data.renter_profiles[0]
            : data.renter_profiles;

        return renter.user_id as string;
    }

    private async getShopVariantIds(shopId: string) {
        const { data, error } = await this.supabaseService.client
            .from("product_variants")
            .select("variant_id, products!inner(shop_id)")
            .eq("products.shop_id", shopId);

        if (error) {
            throw new BadRequestException(`Không thể tải sản phẩm của shop: ${error.message}`);
        }

        return (data ?? []).map((variant: any) => variant.variant_id as string);
    }

    private async getShopOrderIds(shopId: string) {
        const variantIds = await this.getShopVariantIds(shopId);

        if (variantIds.length === 0) return [];

        const { data, error } = await this.supabaseService.client
            .from("rental_order_items")
            .select("order_id")
            .in("variant_id", variantIds);

        if (error) {
            throw new BadRequestException(`Không thể tải đơn của shop: ${error.message}`);
        }

        return [...new Set((data ?? []).map((item) => item.order_id as string))];
    }

    private async assertVendorOwnsOrder(authUserId: string, orderId: string) {
        const shop = await this.getVendorShop(authUserId);
        const orderIds = await this.getShopOrderIds(shop.shop_id);

        if (!orderIds.includes(orderId)) {
            throw new ForbiddenException("Bạn không có quyền xử lý đơn thuê này");
        }

        return shop;
    }

    private async assertCanViewOrder(authUserId: string, order: any) {
        const profile = await this.getUserProfile(authUserId);

        const renter = await this.supabaseService.client
            .from("renter_profiles")
            .select("renter_profile_id")
            .eq("user_id", profile.user_id)
            .maybeSingle();

        if (renter.data?.renter_profile_id === order.renter_profile_id) {
            return;
        }

        const shop = await this.supabaseService.client
            .from("shop_profiles")
            .select("shop_id")
            .eq("user_id", profile.user_id)
            .maybeSingle();

        if (shop.data) {
            const orderIds = await this.getShopOrderIds(shop.data.shop_id);
            if (orderIds.includes(order.order_id)) return;
        }

        const admin = await this.supabaseService.client
            .from("admin_profiles")
            .select("admin_id")
            .eq("user_id", profile.user_id)
            .maybeSingle();

        if (admin.data) return;

        throw new ForbiddenException("Bạn không có quyền xem yêu cầu hoàn trả này");
    }

    private async upsertPickupReturnRecord(orderId: string, updates: Record<string, any>) {
        const { data: existing, error: existingError } = await this.supabaseService.client
            .from("pickup_return_records")
            .select("record_id")
            .eq("order_id", orderId)
            .maybeSingle();

        if (existingError) {
            throw new BadRequestException(`Không thể kiểm tra biên bản hoàn trả: ${existingError.message}`);
        }

        if (existing) {
            const { error } = await this.supabaseService.client
                .from("pickup_return_records")
                .update(updates)
                .eq("record_id", existing.record_id);

            if (error) {
                throw new BadRequestException(`Không thể cập nhật biên bản hoàn trả: ${error.message}`);
            }
            return;
        }

        const { error } = await this.supabaseService.client
            .from("pickup_return_records")
            .insert({ order_id: orderId, ...updates });

        if (error) {
            throw new BadRequestException(`Không thể tạo biên bản hoàn trả: ${error.message}`);
        }
    }

    private returnOrderSelect() {
        return `
            order_id,
            renter_profile_id,
            status,
            payment_status,
            rental_start,
            rental_end,
            subtotal,
            total_amount,
            late_fee,
            damage_fee,
            created_at,
            completed_at,
            pickup_return_records (
                record_id,
                pickup_at,
                returned_at,
                pickup_condition_note,
                return_condition_note,
                return_requested_at,
                return_request_note,
                return_condition_status,
                return_evidence_urls,
                vendor_return_status,
                vendor_return_note,
                return_issue_reason,
                return_issue_description,
                return_issue_evidence_urls,
                updated_at
            ),
            renter_profiles (
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
                        shop_profiles (
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
        `;
    }

    private mapReturnRequest(order: any, shopId?: string) {
        const record = Array.isArray(order.pickup_return_records)
            ? order.pickup_return_records[0]
            : order.pickup_return_records;
        const renter = Array.isArray(order.renter_profiles)
            ? order.renter_profiles[0]
            : order.renter_profiles;
        const user = Array.isArray(renter?.user_profiles)
            ? renter.user_profiles[0]
            : renter?.user_profiles;

        const items = (order.rental_order_items ?? [])
            .filter((item: any) => {
                if (!shopId) return true;
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
                    lineSubtotal: Number(item.line_subtotal || 0),
                };
            });

        return {
            orderId: order.order_id,
            status: order.status,
            paymentStatus: order.payment_status,
            rentalStart: order.rental_start,
            rentalEnd: order.rental_end,
            totalAmount: Number(order.total_amount ?? 0),
            lateFee: Number(order.late_fee ?? 0),
            damageFee: Number(order.damage_fee ?? 0),
            createdAt: order.created_at,
            completedAt: order.completed_at,
            renter: {
                fullName: user?.full_name ?? "Người thuê",
                email: user?.email ?? null,
                phoneNumber: user?.phone_number ?? null,
            },
            returnRecord: record
                ? {
                      recordId: record.record_id,
                      pickupAt: record.pickup_at,
                      returnedAt: record.returned_at,
                      pickupConditionNote: record.pickup_condition_note,
                      returnConditionNote: record.return_condition_note,
                      returnRequestedAt: record.return_requested_at,
                      returnRequestNote: record.return_request_note,
                      returnConditionStatus: record.return_condition_status,
                      returnEvidenceUrls: Array.isArray(record.return_evidence_urls)
                          ? record.return_evidence_urls
                          : [],
                      vendorReturnStatus: record.vendor_return_status,
                      vendorReturnNote: record.vendor_return_note,
                      returnIssueReason: record.return_issue_reason,
                      returnIssueDescription: record.return_issue_description,
                      returnIssueEvidenceUrls: Array.isArray(record.return_issue_evidence_urls)
                          ? record.return_issue_evidence_urls
                          : [],
                      updatedAt: record.updated_at,
                  }
                : null,
            items,
        };
    }

    private mapAdminReturnDispute(dispute: any) {
        const order = Array.isArray(dispute.rental_orders)
            ? dispute.rental_orders[0]
            : dispute.rental_orders;
        const renterProfile = Array.isArray(order?.renter_profiles)
            ? order.renter_profiles[0]
            : order?.renter_profiles;
        const renterUser = Array.isArray(renterProfile?.user_profiles)
            ? renterProfile.user_profiles[0]
            : renterProfile?.user_profiles;
        const complaints = [...(dispute.complaints ?? [])].sort(
            (a: any, b: any) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        const complaint = complaints[0] ?? null;
        const complainant = Array.isArray(complaint?.user_profiles)
            ? complaint.user_profiles[0]
            : complaint?.user_profiles;
        const pickupReturnRecord = Array.isArray(order?.pickup_return_records)
            ? order.pickup_return_records[0]
            : order?.pickup_return_records;
        const earlyReturnRequests = [...(order?.early_return_requests ?? [])].sort(
            (a: any, b: any) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        const earlyReturnRequest = earlyReturnRequests[0] ?? null;
        const evidenceUrls = [
            ...(Array.isArray(dispute.evidence_urls) ? dispute.evidence_urls : []),
            ...(Array.isArray(complaint?.evidence_urls) ? complaint.evidence_urls : []),
            ...(Array.isArray(pickupReturnRecord?.return_evidence_urls)
                ? pickupReturnRecord.return_evidence_urls
                : []),
            ...(Array.isArray(pickupReturnRecord?.return_issue_evidence_urls)
                ? pickupReturnRecord.return_issue_evidence_urls
                : []),
            ...(Array.isArray(earlyReturnRequest?.condition_image_urls)
                ? earlyReturnRequest.condition_image_urls
                : []),
        ].filter(Boolean);
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
                productName: product?.name ?? "Sản phẩm",
                variantName: variant?.variant_name ?? null,
                quantity: Number(item.quantity || 0),
                shopName: shop?.shop_name ?? null,
                shopOwnerName: shopUser?.full_name ?? null,
            };
        });
        const firstShop = items.find((item: any) => item.shopName || item.shopOwnerName);

        return {
            disputeId: dispute.dispute_id,
            orderId: dispute.order_id,
            type: dispute.dispute_type,
            reason: dispute.reason,
            resolution: dispute.resolution,
            status: dispute.status,
            evidenceUrls: [...new Set(evidenceUrls)],
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
                totalAmount: Number(order?.total_amount ?? 0),
                lateFee: Number(order?.late_fee ?? 0),
                damageFee: Number(order?.damage_fee ?? 0),
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
    }

    private getPagination(query: PaginationQuery) {
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

    private async getOrderVendorUserIds(orderId: string) {
        const { data, error } = await this.supabaseService.client
            .from("rental_order_items")
            .select("product_variants!inner(products!inner(shop_profiles!inner(user_id)))")
            .eq("order_id", orderId);

        if (error) {
            throw new BadRequestException(`Không thể tìm vendor của đơn: ${error.message}`);
        }

        return [
            ...new Set(
                (data ?? []).flatMap((item: any) => {
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
        ];
    }

    private async getAdminUserIds() {
        const { data, error } = await this.supabaseService.client
            .from("admin_profiles")
            .select("user_id");

        if (error) return [];

        return (data ?? []).map((admin) => admin.user_id as string);
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
}
