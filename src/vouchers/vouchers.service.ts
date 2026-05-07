import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";
import { CreateVoucherDto } from "./dto/create-voucher.dto";
import { UpdateVoucherDto } from "./dto/update-voucher.dto";
import { ValidateVoucherDto } from "./dto/validate-voucher.dto";

type VoucherScope = "PLATFORM" | "SHOP";
type VoucherStatus = "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "ARCHIVED";

type VoucherValidationOptions = {
    throwOnInvalid?: boolean;
};

@Injectable()
export class VouchersService {
    constructor(private readonly supabaseService: SupabaseService) {}

    private get supabase() {
        return this.supabaseService.client;
    }

    async validateVoucher(dto: ValidateVoucherDto, options: VoucherValidationOptions = {}) {
        const code = this.normalizeCode(dto.code);
        const subtotal = Math.max(0, Number(dto.subtotal ?? 0));
        const invalid = (message: string) => {
            if (options.throwOnInvalid) {
                throw new BadRequestException(message);
            }

            return {
                valid: false,
                discountAmount: 0,
                voucherId: null,
                message,
            };
        };

        if (!code) return invalid("Vui lòng nhập mã giảm giá.");

        const now = new Date().toISOString();
        const { data: voucher, error } = await this.supabase
            .from("vouchers")
            .select("*")
            .ilike("code", code)
            .eq("is_active", true)
            .eq("status", "APPROVED")
            .lte("valid_from", now)
            .gte("valid_to", now)
            .maybeSingle();

        if (error) {
            throw new BadRequestException(`Không thể kiểm tra voucher: ${error.message}`);
        }

        if (!voucher) return invalid("Mã giảm giá không hợp lệ hoặc đã hết hạn.");

        if (voucher.scope === "SHOP" && voucher.shop_id !== dto.shopId) {
            return invalid("Mã giảm giá này chỉ áp dụng cho cửa hàng phát hành.");
        }

        const discountAmount = this.calculateDiscountAmount(voucher, subtotal);

        if (discountAmount <= 0) {
            return invalid("Mã giảm giá không còn giá trị áp dụng cho đơn này.");
        }

        return {
            valid: true,
            discountAmount,
            voucherId: voucher.voucher_id,
            code: voucher.code,
            scope: voucher.scope as VoucherScope,
            shopId: voucher.shop_id ?? null,
            message: "Áp dụng mã giảm giá thành công.",
        };
    }

    async listVendorVouchers(authUserId: string | undefined) {
        const shop = await this.getVendorShop(authUserId);
        const { data, error } = await this.supabase
            .from("vouchers")
            .select("*")
            .eq("shop_id", shop.shop_id)
            .eq("scope", "SHOP")
            .order("created_at", { ascending: false });

        if (error) {
            throw new BadRequestException(`Không thể tải voucher của shop: ${error.message}`);
        }

        return { vouchers: (data ?? []).map((voucher) => this.mapVoucher(voucher)) };
    }

    async createVendorVoucher(authUserId: string | undefined, dto: CreateVoucherDto) {
        const { profile, shop } = await this.getVendorContext(authUserId);
        this.assertValidPeriod(dto.validFrom, dto.validTo);

        const { data, error } = await this.supabase
            .from("vouchers")
            .insert({
                code: this.normalizeCode(dto.code),
                discount_type: dto.discountType,
                discount_value: dto.discountValue,
                valid_from: dto.validFrom,
                valid_to: dto.validTo,
                is_active: true,
                scope: "SHOP",
                shop_id: shop.shop_id,
                status: "DRAFT",
                created_by_user_id: profile.user_id,
            })
            .select("*")
            .single();

        if (error || !data) {
            throw new BadRequestException(error?.message || "Không thể tạo voucher.");
        }

        return this.mapVoucher(data);
    }

    async updateVendorVoucher(authUserId: string | undefined, voucherId: string, dto: UpdateVoucherDto) {
        const shop = await this.getVendorShop(authUserId);
        const voucher = await this.getVoucherOrThrow(voucherId);

        if (voucher.shop_id !== shop.shop_id || voucher.scope !== "SHOP") {
            throw new ForbiddenException("Bạn không có quyền chỉnh sửa voucher này.");
        }

        if (!["DRAFT", "REJECTED"].includes(voucher.status)) {
            throw new BadRequestException("Chỉ voucher bản nháp hoặc bị từ chối mới có thể chỉnh sửa.");
        }

        const nextValidFrom = dto.validFrom ?? voucher.valid_from;
        const nextValidTo = dto.validTo ?? voucher.valid_to;
        this.assertValidPeriod(nextValidFrom, nextValidTo);

        const updates = this.mapVoucherUpdate(dto);

        const { data, error } = await this.supabase
            .from("vouchers")
            .update({
                ...updates,
                status: "DRAFT",
                rejection_reason: null,
                updated_at: new Date().toISOString(),
            })
            .eq("voucher_id", voucherId)
            .select("*")
            .single();

        if (error || !data) {
            throw new BadRequestException(error?.message || "Không thể cập nhật voucher.");
        }

        return this.mapVoucher(data);
    }

    async submitVendorVoucher(authUserId: string | undefined, voucherId: string) {
        const shop = await this.getVendorShop(authUserId);
        const voucher = await this.getVoucherOrThrow(voucherId);

        if (voucher.shop_id !== shop.shop_id || voucher.scope !== "SHOP") {
            throw new ForbiddenException("Bạn không có quyền gửi duyệt voucher này.");
        }

        if (!["DRAFT", "REJECTED"].includes(voucher.status)) {
            throw new BadRequestException("Chỉ voucher bản nháp hoặc bị từ chối mới có thể gửi duyệt.");
        }

        const { data, error } = await this.supabase
            .from("vouchers")
            .update({
                status: "PENDING_REVIEW",
                rejection_reason: null,
                updated_at: new Date().toISOString(),
            })
            .eq("voucher_id", voucherId)
            .select("*")
            .single();

        if (error || !data) {
            throw new BadRequestException(error?.message || "Không thể gửi duyệt voucher.");
        }

        return this.mapVoucher(data);
    }

    async listAdminVouchers(
        authUserId: string | undefined,
        filters: { status?: string; scope?: string },
    ) {
        await this.assertAdmin(authUserId);
        let request = this.supabase
            .from("vouchers")
            .select("*, shop_profiles(shop_name)")
            .order("created_at", { ascending: false });

        if (filters.status && filters.status !== "ALL") {
            request = request.eq("status", filters.status);
        }

        if (filters.scope && filters.scope !== "ALL") {
            request = request.eq("scope", filters.scope);
        }

        const { data, error } = await request;

        if (error) {
            throw new BadRequestException(`Không thể tải danh sách voucher: ${error.message}`);
        }

        return { vouchers: (data ?? []).map((voucher) => this.mapVoucher(voucher)) };
    }

    async createAdminVoucher(authUserId: string | undefined, dto: CreateVoucherDto) {
        const profile = await this.assertAdmin(authUserId);
        this.assertValidPeriod(dto.validFrom, dto.validTo);

        const { data, error } = await this.supabase
            .from("vouchers")
            .insert({
                code: this.normalizeCode(dto.code),
                discount_type: dto.discountType,
                discount_value: dto.discountValue,
                valid_from: dto.validFrom,
                valid_to: dto.validTo,
                is_active: true,
                scope: "PLATFORM",
                shop_id: null,
                status: "APPROVED",
                created_by_user_id: profile.user_id,
            })
            .select("*")
            .single();

        if (error || !data) {
            throw new BadRequestException(error?.message || "Không thể tạo voucher.");
        }

        return this.mapVoucher(data);
    }

    async approveAdminVoucher(authUserId: string | undefined, voucherId: string) {
        await this.assertAdmin(authUserId);
        return this.setVoucherStatus(voucherId, "APPROVED");
    }

    async rejectAdminVoucher(authUserId: string | undefined, voucherId: string, reason: string) {
        await this.assertAdmin(authUserId);
        const { data, error } = await this.supabase
            .from("vouchers")
            .update({
                status: "REJECTED",
                rejection_reason: reason.trim(),
                updated_at: new Date().toISOString(),
            })
            .eq("voucher_id", voucherId)
            .select("*")
            .single();

        if (error || !data) {
            throw new BadRequestException(error?.message || "Không thể từ chối voucher.");
        }

        return this.mapVoucher(data);
    }

    private async setVoucherStatus(voucherId: string, status: VoucherStatus) {
        const { data, error } = await this.supabase
            .from("vouchers")
            .update({
                status,
                rejection_reason: status === "APPROVED" ? null : undefined,
                updated_at: new Date().toISOString(),
            })
            .eq("voucher_id", voucherId)
            .select("*")
            .single();

        if (error || !data) {
            throw new BadRequestException(error?.message || "Không thể cập nhật voucher.");
        }

        return this.mapVoucher(data);
    }

    private calculateDiscountAmount(voucher: any, subtotal: number) {
        const value = Number(voucher.discount_value ?? 0);
        const rawDiscount =
            voucher.discount_type === "PERCENTAGE"
                ? subtotal * (value / 100)
                : value;

        return Math.max(0, Math.min(subtotal, Math.floor(rawDiscount)));
    }

    private async getVoucherOrThrow(voucherId: string) {
        const { data, error } = await this.supabase
            .from("vouchers")
            .select("*")
            .eq("voucher_id", voucherId)
            .single();

        if (error || !data) {
            throw new NotFoundException("Không tìm thấy voucher.");
        }

        return data as any;
    }

    private mapVoucherUpdate(dto: UpdateVoucherDto) {
        return Object.fromEntries(
            Object.entries({
                code: dto.code ? this.normalizeCode(dto.code) : undefined,
                discount_type: dto.discountType,
                discount_value: dto.discountValue,
                valid_from: dto.validFrom,
                valid_to: dto.validTo,
            }).filter(([, value]) => value !== undefined),
        );
    }

    private assertValidPeriod(validFrom: string, validTo: string) {
        if (new Date(validTo) <= new Date(validFrom)) {
            throw new BadRequestException("Ngày kết thúc voucher phải sau ngày bắt đầu.");
        }
    }

    private async getVendorContext(authUserId: string | undefined) {
        const profile = await this.getUserProfile(authUserId);
        const { data: shop, error } = await this.supabase
            .from("shop_profiles")
            .select("shop_id, shop_name, user_id")
            .eq("user_id", profile.user_id)
            .single();

        if (error || !shop) {
            throw new NotFoundException("Không tìm thấy shop của tài khoản này.");
        }

        return { profile, shop };
    }

    private async getVendorShop(authUserId: string | undefined) {
        return (await this.getVendorContext(authUserId)).shop;
    }

    private async assertAdmin(authUserId: string | undefined) {
        const profile = await this.getUserProfile(authUserId);
        const { data, error } = await this.supabase
            .from("admin_profiles")
            .select("admin_id, user_id")
            .eq("user_id", profile.user_id)
            .maybeSingle();

        if (error || !data) {
            throw new ForbiddenException("Bạn không có quyền admin.");
        }

        return profile;
    }

    private async getUserProfile(authUserId: string | undefined) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập.");
        }

        const { data, error } = await this.supabase
            .from("user_profiles")
            .select("user_id, auth_user_id, full_name, email")
            .eq("auth_user_id", authUserId)
            .single();

        if (error || !data) {
            throw new NotFoundException("Không tìm thấy hồ sơ người dùng.");
        }

        return data;
    }

    private normalizeCode(code: string) {
        return code.trim().toUpperCase();
    }

    private mapVoucher(voucher: any) {
        const shop = Array.isArray(voucher.shop_profiles)
            ? voucher.shop_profiles[0]
            : voucher.shop_profiles;

        return {
            voucherId: voucher.voucher_id,
            code: voucher.code,
            discountType: voucher.discount_type,
            discountValue: Number(voucher.discount_value ?? 0),
            validFrom: voucher.valid_from,
            validTo: voucher.valid_to,
            isActive: Boolean(voucher.is_active),
            scope: voucher.scope,
            shopId: voucher.shop_id ?? null,
            shopName: shop?.shop_name ?? null,
            status: voucher.status,
            rejectionReason: voucher.rejection_reason ?? null,
            createdAt: voucher.created_at ?? null,
            updatedAt: voucher.updated_at ?? null,
        };
    }
}

