import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { RegisterVendorDto } from './dto/register-vendor.dto';
import { UpdateShopProfileDto } from './dto/update-shop-profile.dto';

type VendorVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

@Injectable()
export class VendorsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private async getUserProfileByAuthId(authUserId: string) {
    const supabase = this.supabaseService.client;

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select(
        `
          user_id,
          auth_user_id,
          full_name,
          email,
          phone_number,
          user_roles (
            roles (
              role_name
            )
          )
        `,
      )
      .eq('auth_user_id', authUserId)
      .single();

    if (error || !profile) {
      throw new NotFoundException('User profile not found.');
    }

    return profile;
  }

  private extractRoleNames(userRoles: any[] | null | undefined) {
    return (
      userRoles
        ?.map((userRole: any) => {
          if (Array.isArray(userRole.roles)) {
            return userRole.roles[0]?.role_name;
          }

          return userRole.roles?.role_name;
        })
        .filter(Boolean) ?? []
    );
  }

  private async ensureAdmin(authUserId: string) {
    const profile = await this.getUserProfileByAuthId(authUserId);
    const roleNames = this.extractRoleNames(profile.user_roles);

    if (!roleNames.includes('ADMIN')) {
      throw new ForbiddenException('Only admins can perform this action.');
    }

    return profile;
  }

  private mapVendorRequest(shop: any, owner?: any) {
    return {
      shopId: shop.shop_id,
      userId: shop.user_id,
      shopName: shop.shop_name,
      description: shop.description,
      businessLicenseNo: shop.business_license_no,
      verificationStatus: shop.verification_status,
      contactPhone: shop.contact_phone,
      contactEmail: shop.contact_email,
      partnerType: shop.partner_type,
      identityNumber: shop.identity_number,
      identityFrontPath: shop.identity_front_url,
      identityBackPath: shop.identity_back_url,
      province: shop.province,
      district: shop.district,
      addressDetail: shop.address_detail,
      ownerFullName: owner?.full_name ?? null,
      ownerEmail: owner?.email ?? null,
      ownerPhoneNumber: owner?.phone_number ?? null,
      createdAt: null,
    };
  }

  async getVendorVerificationRequests(
    authUser: any,
    status: 'ALL' | VendorVerificationStatus = 'PENDING',
  ) {
    await this.ensureAdmin(authUser.id);

    const supabase = this.supabaseService.client;

    let query = supabase
      .from('shop_profiles')
      .select(
        `
          shop_id,
          user_id,
          shop_name,
          description,
          business_license_no,
          verification_status,
          contact_phone,
          contact_email,
          partner_type,
          identity_number,
          identity_front_url,
          identity_back_url,
          province,
          district,
          address_detail
        `,
      )
      .order('shop_name', { ascending: true });

    if (status !== 'ALL') {
      query = query.eq('verification_status', status);
    }

    const { data: shops, error: shopsError } = await query;

    if (shopsError) {
      throw new InternalServerErrorException(
        `Failed to load vendor requests: ${shopsError.message}`,
      );
    }

    const shopRows = shops ?? [];

    if (shopRows.length === 0) {
      return [];
    }

    const userIds = shopRows.map((shop) => shop.user_id);
    const { data: users, error: usersError } = await supabase
      .from('user_profiles')
      .select('user_id, full_name, email, phone_number')
      .in('user_id', userIds);

    if (usersError) {
      throw new InternalServerErrorException(
        `Failed to load vendor owners: ${usersError.message}`,
      );
    }

    const userMap = new Map((users ?? []).map((user) => [user.user_id, user]));

    return shopRows.map((shop) =>
      this.mapVendorRequest(shop, userMap.get(shop.user_id)),
    );
  }

  private async setVendorRole(userId: string, shouldHaveRole: boolean) {
    const supabase = this.supabaseService.client;

    const { data: roleData, error: roleError } = await supabase
      .from('roles')
      .select('role_id')
      .eq('role_name', 'SHOP_OWNER')
      .single();

    if (roleError || !roleData) {
      throw new InternalServerErrorException('SHOP_OWNER role not found.');
    }

    if (shouldHaveRole) {
      const { error: assignRoleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role_id: roleData.role_id,
        });

      if (assignRoleError && assignRoleError.code !== '23505') {
        throw new InternalServerErrorException(
          `Failed to assign SHOP_OWNER role: ${assignRoleError.message}`,
        );
      }

      return;
    }

    const { error: removeRoleError } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('role_id', roleData.role_id);

    if (removeRoleError) {
      throw new InternalServerErrorException(
        `Failed to remove SHOP_OWNER role: ${removeRoleError.message}`,
      );
    }
  }

  async reviewVendorRequest(
    authUser: any,
    shopId: string,
    status: Extract<VendorVerificationStatus, 'VERIFIED' | 'REJECTED'>,
  ) {
    await this.ensureAdmin(authUser.id);

    const supabase = this.supabaseService.client;
    const { data: shop, error: shopError } = await supabase
      .from('shop_profiles')
      .select(
        `
          shop_id,
          user_id,
          shop_name,
          description,
          business_license_no,
          verification_status,
          contact_phone,
          contact_email,
          partner_type,
          identity_number,
          identity_front_url,
          identity_back_url,
          province,
          district,
          address_detail
        `,
      )
      .eq('shop_id', shopId)
      .single();

    if (shopError || !shop) {
      throw new NotFoundException('Vendor request not found.');
    }

    const isApproved = status === 'VERIFIED';
    const { data: updatedShop, error: updateError } = await supabase
      .from('shop_profiles')
      .update({
        verification_status: status,
        is_active: isApproved,
      })
      .eq('shop_id', shopId)
      .select(
        `
          shop_id,
          user_id,
          shop_name,
          description,
          business_license_no,
          verification_status,
          contact_phone,
          contact_email,
          partner_type,
          identity_number,
          identity_front_url,
          identity_back_url,
          province,
          district,
          address_detail
        `,
      )
      .single();

    if (updateError || !updatedShop) {
      throw new InternalServerErrorException(
        `Failed to update vendor request: ${updateError?.message}`,
      );
    }

    await this.setVendorRole(updatedShop.user_id, isApproved);

    const { data: owner, error: ownerError } = await supabase
      .from('user_profiles')
      .select('user_id, full_name, email, phone_number')
      .eq('user_id', updatedShop.user_id)
      .single();

    if (ownerError) {
      throw new InternalServerErrorException(
        `Failed to load vendor owner: ${ownerError.message}`,
      );
    }

    return {
      message: `Vendor request ${isApproved ? 'approved' : 'rejected'} successfully.`,
      vendor: this.mapVendorRequest(updatedShop, owner),
    };
  }

  async registerVendor(user: any, dto: RegisterVendorDto) {
    const supabase = this.supabaseService.client;

    // 1. Get user_profile ID
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('auth_user_id', user.id)
      .single();

    if (profileError || !userProfile) {
      throw new BadRequestException('User profile not found. Please complete profile first.');
    }

    const userId = userProfile.user_id;

    // 2. Check if shop_profile already exists
    const { data: existingShop, error: checkError } = await supabase
      .from('shop_profiles')
      .select('shop_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (checkError) {
      throw new InternalServerErrorException('Error checking existing shop profile');
    }

    if (existingShop) {
      throw new BadRequestException('User already has a shop profile');
    }

    // 3. Insert into shop_profiles
    const { data: shopProfile, error: shopError } = await supabase
      .from('shop_profiles')
      .insert({
        user_id: userId,
        shop_name: dto.shopName,
        description: dto.description || null,
        contact_phone: dto.contactPhone,
        contact_email: dto.contactEmail,
        partner_type: dto.partnerType,
        identity_number: dto.identityNumber,
        identity_front_url: dto.identityFrontUrl || null,
        identity_back_url: dto.identityBackUrl || null,
        province: dto.province,
        district: dto.district,
        address_detail: dto.addressDetail,
        verification_status: 'PENDING',
        is_active: false,
      })
      .select()
      .single();

    if (shopError) {
      throw new InternalServerErrorException('Failed to create shop profile: ' + shopError.message);
    }

    return {
      message: 'Vendor registration submitted successfully',
      shopProfile,
    };
  }

  private readonly SHOP_SELECT_FIELDS = `
    shop_id,
    user_id,
    shop_name,
    description,
    contact_phone,
    contact_email,
    partner_type,
    identity_number,
    province,
    district,
    address_detail,
    logo_url,
    verification_status,
    rating_average,
    is_active
  `;

  async getMyShop(authUserId: string) {
    const supabase = this.supabaseService.client;

    const profile = await this.getUserProfileByAuthId(authUserId);

    const { data: shop, error } = await supabase
      .from('shop_profiles')
      .select(this.SHOP_SELECT_FIELDS)
      .eq('user_id', profile.user_id)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to load shop profile: ${error.message}`,
      );
    }

    if (!shop) {
      throw new NotFoundException('Shop profile not found.');
    }

    return shop;
  }

  async updateMyShop(authUserId: string, dto: UpdateShopProfileDto) {
    const supabase = this.supabaseService.client;

    const profile = await this.getUserProfileByAuthId(authUserId);

    const { data: existingShop, error: fetchError } = await supabase
      .from('shop_profiles')
      .select('shop_id')
      .eq('user_id', profile.user_id)
      .maybeSingle();

    if (fetchError) {
      throw new InternalServerErrorException(
        `Failed to load shop profile: ${fetchError.message}`,
      );
    }

    if (!existingShop) {
      throw new NotFoundException('Shop profile not found.');
    }

    const updates: Record<string, any> = {};
    if (dto.shopName !== undefined) updates.shop_name = dto.shopName;
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.contactPhone !== undefined) updates.contact_phone = dto.contactPhone;
    if (dto.contactEmail !== undefined) updates.contact_email = dto.contactEmail;
    if (dto.province !== undefined) updates.province = dto.province;
    if (dto.district !== undefined) updates.district = dto.district;
    if (dto.addressDetail !== undefined) updates.address_detail = dto.addressDetail;
    if (dto.logoUrl !== undefined) updates.logo_url = dto.logoUrl;

    if (Object.keys(updates).length === 0) {
      throw new BadRequestException('No fields to update.');
    }

    const { data: updatedShop, error: updateError } = await supabase
      .from('shop_profiles')
      .update(updates)
      .eq('shop_id', existingShop.shop_id)
      .select(this.SHOP_SELECT_FIELDS)
      .single();

    if (updateError || !updatedShop) {
      throw new InternalServerErrorException(
        `Failed to update shop profile: ${updateError?.message}`,
      );
    }

    return updatedShop;
  }
}
