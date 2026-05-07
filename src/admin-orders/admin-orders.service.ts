import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

type SupabaseError = { message: string };

type UserProfileRow = {
  user_id: string;
  user_roles?: Array<{
    roles: { role_name: string } | { role_name: string }[] | null;
  }> | null;
};

type OrderRow = {
  order_id: string;
  status: string;
  payment_status: string;
  rental_start: string;
  rental_end: string;
  subtotal: number | string | null;
  deposit_amount: number | string | null;
  shipping_fee: number | string | null;
  discount_amount: number | string | null;
  total_amount: number | string | null;
  created_at: string;
  renter_profiles?: any;
  rental_order_items?: any;
  escrow_transactions?: any;
};

type ListQuery = {
  page: number;
  limit: number;
  status?: string;
  search?: string;
};

@Injectable()
export class AdminOrdersService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private get supabase() {
    return this.supabaseService.client;
  }

  async list(authUserId: string, query: ListQuery) {
    await this.ensureAdmin(authUserId);

    const page = Number.isFinite(query.page) && query.page > 0 ? query.page : 1;
    const limit =
      Number.isFinite(query.limit) && query.limit > 0 ? Math.min(query.limit, 50) : 20;
    const search = query.search?.trim() || undefined;
    const isUuidSearch = Boolean(search && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search));

    // Nếu search là prefix UUID (vd cad05e77) thì PostgREST không hỗ trợ ilike trực tiếp trên UUID.
    // Giải pháp: lấy một tập đơn gần đây rồi lọc theo order_id dạng text ở backend.
    const shouldClientFilterUuidPrefix = Boolean(search && !isUuidSearch);

    let qb = this.supabase
      .from('rental_orders')
      .select(
        `
        order_id,
        status,
        payment_status,
        rental_start,
        rental_end,
        subtotal,
        deposit_amount,
        discount_amount,
        shipping_fee,
        total_amount,
        created_at,
        escrow_transactions (
          released_at
        ),
        renter_profiles (
          renter_profile_id,
          user_profiles (
            full_name,
            email
          )
        ),
        rental_order_items (
          order_item_id,
          quantity,
          product_variants (
            variant_id,
            variant_name,
            products (
              product_id,
              name,
              shop_profiles (
                shop_id,
                shop_name
              )
            )
          )
        )
      `,
        { count: 'exact' },
      )
      .order('created_at', { ascending: false });

    if (query.status) {
      qb = qb.eq('status', query.status);
    }

    if (search && isUuidSearch) {
      qb = qb.eq('order_id', search);
    }

    const { data, error, count } = (await (shouldClientFilterUuidPrefix
      ? qb.limit(500)
      : qb.range((page - 1) * limit, (page - 1) * limit + limit - 1))) as {
      data: OrderRow[] | null;
      error: SupabaseError | null;
      count: number | null;
    };

    if (error) {
      throw new InternalServerErrorException(
        `Không thể tải danh sách đơn thuê: ${error.message}`,
      );
    }

    let mapped = (data ?? []).map((row) => this.mapListOrder(row));

    if (shouldClientFilterUuidPrefix && search) {
      const normalized = search.toLowerCase();
      mapped = mapped.filter((order) => order.id.toLowerCase().includes(normalized));
    }

    const total = shouldClientFilterUuidPrefix ? mapped.length : (count ?? mapped.length);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    if (shouldClientFilterUuidPrefix) {
      const start = (page - 1) * limit;
      mapped = mapped.slice(start, start + limit);
    }

    return {
      orders: mapped,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async getDetail(authUserId: string, orderId: string) {
    await this.ensureAdmin(authUserId);

    const { data, error } = (await this.supabase
      .from('rental_orders')
      .select(
        `
        order_id,
        status,
        payment_status,
        rental_start,
        rental_end,
        subtotal,
        deposit_amount,
        discount_amount,
        shipping_fee,
        late_fee,
        damage_fee,
        total_amount,
        note,
        created_at,
        confirmed_at,
        completed_at,
        escrow_transactions (
          escrow_id,
          amount_held,
          held_at,
          released_at,
          release_reason
        ),
        payment_transactions (
          transaction_id,
          method,
          amount,
          status,
          created_at,
          paid_at
        ),
        renter_profiles (
          renter_profile_id,
          user_profiles (
            full_name,
            email,
            phone_number
          )
        ),
        rental_order_items (
          order_item_id,
          quantity,
          unit_price_per_day,
          line_subtotal,
          line_deposit,
          product_variants (
            variant_id,
            variant_name,
            products (
              product_id,
              name,
              slug,
              shop_profiles (
                shop_id,
                shop_name
              )
            )
          )
        )
      `,
      )
      .eq('order_id', orderId)
      .single()) as { data: OrderRow | null; error: SupabaseError | null };

    if (error || !data) {
      throw new NotFoundException('Không tìm thấy đơn thuê.');
    }

    return { order: this.mapDetailOrder(data) };
  }

  private mapListOrder(row: OrderRow) {
    const renterProfile = Array.isArray(row.renter_profiles)
      ? row.renter_profiles[0]
      : row.renter_profiles;
    const userProfile = Array.isArray(renterProfile?.user_profiles)
      ? renterProfile.user_profiles[0]
      : renterProfile?.user_profiles;

    const items = Array.isArray(row.rental_order_items)
      ? row.rental_order_items
      : row.rental_order_items
        ? [row.rental_order_items]
        : [];

    const firstItem = items[0];
    const variant = Array.isArray(firstItem?.product_variants)
      ? firstItem.product_variants[0]
      : firstItem?.product_variants;
    const product = Array.isArray(variant?.products) ? variant.products[0] : variant?.products;
    const shop = Array.isArray(product?.shop_profiles)
      ? product.shop_profiles[0]
      : product?.shop_profiles;

    const escrowRow = Array.isArray(row.escrow_transactions)
      ? row.escrow_transactions[0]
      : row.escrow_transactions;

    return {
      id: row.order_id,
      renter: userProfile?.full_name ?? userProfile?.email ?? 'Người thuê',
      shop: shop?.shop_name ?? 'Shop Amonzan',
      product: product?.name ?? variant?.variant_name ?? 'Sản phẩm',
      startDate: row.rental_start,
      endDate: row.rental_end,
      total: Number(row.total_amount ?? 0),
      deposit: Number(row.deposit_amount ?? 0),
      status: row.status,
      escrow: escrowRow?.released_at ? 'RELEASED' : 'HELD',
      paymentStatus: row.payment_status,
      createdAt: row.created_at,
      itemCount: items.reduce((sum: number, it: any) => sum + Number(it.quantity ?? 0), 0),
    };
  }

  private mapDetailOrder(row: any) {
    const renterProfile = Array.isArray(row.renter_profiles)
      ? row.renter_profiles[0]
      : row.renter_profiles;
    const userProfile = Array.isArray(renterProfile?.user_profiles)
      ? renterProfile.user_profiles[0]
      : renterProfile?.user_profiles;

    const items = Array.isArray(row.rental_order_items)
      ? row.rental_order_items
      : row.rental_order_items
        ? [row.rental_order_items]
        : [];

    const mappedItems = items.map((item: any) => {
      const variant = Array.isArray(item.product_variants)
        ? item.product_variants[0]
        : item.product_variants;
      const product = Array.isArray(variant?.products) ? variant.products[0] : variant?.products;
      const shop = Array.isArray(product?.shop_profiles)
        ? product.shop_profiles[0]
        : product?.shop_profiles;

      return {
        orderItemId: item.order_item_id,
        quantity: Number(item.quantity ?? 0),
        unitPricePerDay: Number(item.unit_price_per_day ?? 0),
        lineSubtotal: Number(item.line_subtotal ?? 0),
        lineDeposit: Number(item.line_deposit ?? 0),
        variantName: variant?.variant_name ?? null,
        product: product
          ? { productId: product.product_id, name: product.name, slug: product.slug }
          : null,
        shop: shop ? { shopId: shop.shop_id, name: shop.shop_name } : null,
      };
    });

    const escrow = Array.isArray(row.escrow_transactions)
      ? row.escrow_transactions[0]
      : row.escrow_transactions;
    const payment = Array.isArray(row.payment_transactions)
      ? row.payment_transactions[0]
      : row.payment_transactions;

    return {
      orderId: row.order_id,
      status: row.status,
      paymentStatus: row.payment_status,
      createdAt: row.created_at,
      rentalStart: row.rental_start,
      rentalEnd: row.rental_end,
      note: row.note ?? null,
      amounts: {
        subtotal: Number(row.subtotal ?? 0),
        discountAmount: Number(row.discount_amount ?? 0),
        depositAmount: Number(row.deposit_amount ?? 0),
        shippingFee: Number(row.shipping_fee ?? 0),
        lateFee: Number(row.late_fee ?? 0),
        damageFee: Number(row.damage_fee ?? 0),
        totalAmount: Number(row.total_amount ?? 0),
      },
      renter: {
        fullName: userProfile?.full_name ?? 'Người thuê',
        email: userProfile?.email ?? null,
        phoneNumber: userProfile?.phone_number ?? null,
      },
      escrow: escrow
        ? {
            escrowId: escrow.escrow_id,
            amountHeld: Number(escrow.amount_held ?? 0),
            heldAt: escrow.held_at,
            releasedAt: escrow.released_at ?? null,
            releaseReason: escrow.release_reason ?? null,
          }
        : null,
      payment: payment
        ? {
            transactionId: payment.transaction_id,
            method: payment.method,
            amount: Number(payment.amount ?? 0),
            status: payment.status,
            paidAt: payment.paid_at ?? null,
          }
        : null,
      items: mappedItems,
    };
  }

  private async ensureAdmin(authUserId: string) {
    const { data: profile, error } = (await this.supabase
      .from('user_profiles')
      .select(
        `
        user_id,
        user_roles (
          roles (
            role_name
          )
        )
      `,
      )
      .eq('auth_user_id', authUserId)
      .single()) as { data: UserProfileRow | null; error: SupabaseError | null };

    if (error || !profile) {
      throw new NotFoundException('Không tìm thấy hồ sơ người dùng.');
    }

    const roles =
      profile.user_roles
        ?.map((userRole) => {
          const role = Array.isArray(userRole.roles) ? userRole.roles[0] : userRole.roles;
          return role?.role_name;
        })
        .filter(Boolean) ?? [];

    if (!roles.includes('ADMIN')) {
      throw new ForbiddenException('Chỉ admin mới được truy cập danh sách đơn thuê.');
    }
  }
}

