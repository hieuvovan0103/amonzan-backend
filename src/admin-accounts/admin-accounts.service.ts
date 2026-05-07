import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

type SupabaseError = {
  message: string;
};

type RoleJoinRow = {
  roles: { role_name: string } | { role_name: string }[] | null;
};

type ShopProfileRow = {
  shop_name: string | null;
  verification_status: string | null;
  is_active: boolean | null;
};

type RenterProfileRow = {
  verification_status: string | null;
  reputation_score: number | null;
  penalty_points: number | string | null;
};

type AccountRow = {
  user_id: string;
  auth_user_id: string | null;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  is_email_verified: boolean | null;
  is_phone_verified: boolean | null;
  created_at: string;
  user_roles?: RoleJoinRow[] | null;
  shop_profiles?: ShopProfileRow[] | ShopProfileRow | null;
  renter_profiles?: RenterProfileRow[] | RenterProfileRow | null;
};

type RoleRow = {
  role_id: string;
  role_name: string;
};

const EDITABLE_ROLES = ['RENTER', 'SHOP_OWNER'];

@Injectable()
export class AdminAccountsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async list(authUserId: string, query: { search?: string; role?: string }) {
    await this.ensureAdmin(authUserId);

    const { data, error } = (await this.supabaseService.client
      .from('user_profiles')
      .select(
        `
        user_id,
        auth_user_id,
        full_name,
        email,
        phone_number,
        is_email_verified,
        is_phone_verified,
        created_at,
        user_roles (
          roles (
            role_name
          )
        ),
        shop_profiles (
          shop_name,
          verification_status,
          is_active
        ),
        renter_profiles (
          verification_status,
          reputation_score,
          penalty_points
        )
      `,
      )
      .order('created_at', { ascending: false })) as {
      data: AccountRow[] | null;
      error: SupabaseError | null;
    };

    if (error) {
      throw new BadRequestException(
        `Không thể tải tài khoản: ${error.message}`,
      );
    }

    const search = query.search?.trim().toLowerCase();
    const role = query.role && query.role !== 'ALL' ? query.role : null;

    return {
      accounts: (data ?? [])
        .map((account) => this.mapAccount(account))
        .filter((account) => {
          if (role && !account.roles.includes(role)) return false;
          if (!search) return true;
          return [
            account.fullName,
            account.email,
            account.phoneNumber,
            account.userId,
            account.shopName,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(search));
        }),
    };
  }

  async updateRoles(
    authUserId: string,
    targetUserId: string,
    requestedRoles: Array<'RENTER' | 'SHOP_OWNER'>,
  ) {
    await this.ensureAdmin(authUserId);
    const existingRoles = await this.getUserRoleNames(targetUserId);

    if (existingRoles.includes('ADMIN')) {
      throw new ForbiddenException(
        'Không thể chỉnh quyền ADMIN từ giao diện này.',
      );
    }

    const rolesByName = await this.getRolesByName(EDITABLE_ROLES);
    const editableRoleIds = EDITABLE_ROLES.map(
      (role) => rolesByName.get(role)?.role_id,
    ).filter(Boolean) as string[];
    const nextRoleIds = requestedRoles
      .map((role) => rolesByName.get(role)?.role_id)
      .filter(Boolean) as string[];

    if (editableRoleIds.length === 0) {
      throw new BadRequestException(
        'Không tìm thấy cấu hình quyền có thể chỉnh.',
      );
    }

    const { error: deleteError } = await this.supabaseService.client
      .from('user_roles')
      .delete()
      .eq('user_id', targetUserId)
      .in('role_id', editableRoleIds);

    if (deleteError) {
      throw new BadRequestException(
        `Không thể cập nhật quyền: ${deleteError.message}`,
      );
    }

    if (nextRoleIds.length > 0) {
      const { error: insertError } = await this.supabaseService.client
        .from('user_roles')
        .insert(
          nextRoleIds.map((roleId) => ({
            user_id: targetUserId,
            role_id: roleId,
          })),
        );

      if (insertError) {
        throw new BadRequestException(
          `Không thể gán quyền mới: ${insertError.message}`,
        );
      }
    }

    return { success: true, roles: [...new Set(requestedRoles)] };
  }

  private mapAccount(account: AccountRow) {
    const shop = Array.isArray(account.shop_profiles)
      ? account.shop_profiles[0]
      : account.shop_profiles;
    const renter = Array.isArray(account.renter_profiles)
      ? account.renter_profiles[0]
      : account.renter_profiles;
    const roles = this.extractRoles(account.user_roles);
    const penaltyPoints = Number(renter?.penalty_points ?? 0);

    return {
      userId: account.user_id,
      fullName: account.full_name || 'Người dùng Amonzan',
      email: account.email,
      phoneNumber: account.phone_number,
      roles,
      isAdmin: roles.includes('ADMIN'),
      shopName: shop?.shop_name ?? null,
      shopStatus: shop?.verification_status ?? null,
      shopActive: Boolean(shop?.is_active ?? false),
      renterStatus: renter?.verification_status ?? null,
      reputationScore: Number(renter?.reputation_score ?? 0),
      penaltyPoints,
      isEmailVerified: Boolean(account.is_email_verified),
      isPhoneVerified: Boolean(account.is_phone_verified),
      joinedAt: account.created_at,
    };
  }

  private async ensureAdmin(authUserId: string) {
    const { data, error } = (await this.supabaseService.client
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
      .single()) as {
      data: { user_id: string; user_roles?: RoleJoinRow[] | null } | null;
      error: SupabaseError | null;
    };

    if (error || !data) {
      throw new NotFoundException('Không tìm thấy hồ sơ người dùng.');
    }

    if (!this.extractRoles(data.user_roles).includes('ADMIN')) {
      throw new ForbiddenException('Chỉ admin mới được quản lý tài khoản.');
    }

    return data;
  }

  private async getUserRoleNames(userId: string) {
    const { data, error } = (await this.supabaseService.client
      .from('user_roles')
      .select(
        `
        roles (
          role_name
        )
      `,
      )
      .eq('user_id', userId)) as {
      data: RoleJoinRow[] | null;
      error: SupabaseError | null;
    };

    if (error) {
      throw new BadRequestException(
        `Không thể tải quyền người dùng: ${error.message}`,
      );
    }

    return this.extractRoles(data);
  }

  private async getRolesByName(roleNames: string[]) {
    const { data, error } = (await this.supabaseService.client
      .from('roles')
      .select('role_id, role_name')
      .in('role_name', roleNames)) as {
      data: RoleRow[] | null;
      error: SupabaseError | null;
    };

    if (error) {
      throw new BadRequestException(
        `Không thể tải cấu hình quyền: ${error.message}`,
      );
    }

    return new Map((data ?? []).map((role) => [role.role_name, role]));
  }

  private extractRoles(userRoles?: RoleJoinRow[] | null) {
    return (
      userRoles
        ?.map((userRole) => {
          const role = Array.isArray(userRole.roles)
            ? userRole.roles[0]
            : userRole.roles;
          return role?.role_name;
        })
        .filter(Boolean) ?? []
    );
  }
}
