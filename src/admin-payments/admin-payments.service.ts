import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

type SupabaseError = { message: string };

type UserProfileRow = {
  user_id: string;
  user_roles?: Array<{
    roles: { role_name: string } | { role_name: string }[] | null;
  }> | null;
};

type EscrowRow = {
  amount_held: number | string | null;
  released_at: string | null;
};

type RefundRow = {
  amount: number | string | null;
};

type PaymentRow = {
  transaction_id: string;
  order_id: string;
  method: string;
  amount: number | string | null;
  status: string;
  created_at: string;
  paid_at: string | null;
  rental_orders?: any;
};

@Injectable()
export class AdminPaymentsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private get supabase() {
    return this.supabaseService.client;
  }

  async getMetrics(authUserId: string) {
    await this.ensureAdmin(authUserId);

    const { data: escrows, error: escrowError } = (await this.supabase
      .from('escrow_transactions')
      .select('amount_held, released_at')
      .order('held_at', { ascending: false })
      .limit(5000)) as { data: EscrowRow[] | null; error: SupabaseError | null };

    if (escrowError) {
      throw new NotFoundException(`Không thể tải escrow: ${escrowError.message}`);
    }

    const heldTotal = (escrows ?? [])
      .filter((row) => !row.released_at)
      .reduce((sum, row) => sum + Number(row.amount_held ?? 0), 0);

    const { data: refunds, error: refundError } = (await this.supabase
      .from('refund_transactions')
      .select('amount')
      .order('refunded_at', { ascending: false })
      .limit(5000)) as { data: RefundRow[] | null; error: SupabaseError | null };

    if (refundError) {
      throw new NotFoundException(`Không thể tải refund: ${refundError.message}`);
    }

    const refundTotal = (refunds ?? []).reduce(
      (sum, row) => sum + Number(row.amount ?? 0),
      0,
    );

    return {
      heldTotal,
      refundTotal,
      platformFeeTotal: 0,
      generatedAt: new Date().toISOString(),
    };
  }

  async listTransactions(authUserId: string, query?: { limit?: number }) {
    await this.ensureAdmin(authUserId);

    const limit = Number.isFinite(query?.limit) ? Math.min(Number(query?.limit), 200) : 50;

    const { data: payments, error } = (await this.supabase
      .from('payment_transactions')
      .select(
        `
        transaction_id,
        order_id,
        method,
        amount,
        status,
        created_at,
        paid_at,
        rental_orders!inner (
          escrow_transactions (
            released_at
          )
        )
      `,
      )
      .order('created_at', { ascending: false })
      .limit(limit)) as { data: PaymentRow[] | null; error: SupabaseError | null };

    if (error) {
      throw new NotFoundException(`Không thể tải giao dịch thanh toán: ${error.message}`);
    }

    const { data: refunds, error: refundError } = (await this.supabase
      .from('refund_transactions')
      .select('refund_id, order_id, amount, refunded_at')
      .order('refunded_at', { ascending: false })
      .limit(limit)) as { data: any[] | null; error: SupabaseError | null };

    if (refundError) {
      throw new NotFoundException(`Không thể tải giao dịch hoàn tiền: ${refundError.message}`);
    }

    const paymentItems = (payments ?? []).map((row) => {
      const rentalOrder = Array.isArray(row.rental_orders) ? row.rental_orders[0] : row.rental_orders;
      const escrow = Array.isArray(rentalOrder?.escrow_transactions)
        ? rentalOrder.escrow_transactions[0]
        : rentalOrder?.escrow_transactions;

      return {
        id: row.transaction_id,
        orderId: row.order_id,
        type: 'PAYMENT' as const,
        method: row.method,
        amount: Number(row.amount ?? 0),
        status: row.status,
        escrow: escrow?.released_at ? 'RELEASED' : 'HELD',
        createdAt: row.created_at,
        paidAt: row.paid_at,
      };
    });

    const refundItems = (refunds ?? []).map((row) => ({
      id: row.refund_id,
      orderId: row.order_id,
      type: 'REFUND' as const,
      method: 'WALLET',
      amount: Number(row.amount ?? 0),
      status: 'SUCCESS',
      escrow: 'RELEASED',
      createdAt: row.refunded_at,
      paidAt: row.refunded_at,
    }));

    const merged = [...paymentItems, ...refundItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return {
      transactions: merged.slice(0, limit),
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
      throw new ForbiddenException('Chỉ admin mới được truy cập trang ví.');
    }
  }
}

