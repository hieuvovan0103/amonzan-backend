import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class ProfileService {
    constructor(private readonly supabaseService: SupabaseService) { }

    private get supabase() {
        return this.supabaseService.client;
    }

    private async getUserProfileByAuthId(authUserId: string) {
        const { data, error } = await this.supabase
            .from('user_profiles')
            .select('*')
            .eq('auth_user_id', authUserId)
            .single();

        if (error || !data) {
            throw new NotFoundException('Không tìm thấy hồ sơ người dùng');
        }

        return data;
    }

    async getProfile(authUserId: string) {
        const { data, error } = await this.supabase
            .from('user_profiles')
            .select(`
        *,
        user_roles (
          roles (
            role_name
          )
        )
      `)
            .eq('auth_user_id', authUserId)
            .single();

        if (error || !data) {
            throw new NotFoundException('Không tìm thấy hồ sơ người dùng');
        }

        return data;
    }

    async updateProfile(authUserId: string, dto: UpdateProfileDto) {
        const profile = await this.getUserProfileByAuthId(authUserId);

        // Chỉ update những field được cụ thể gửi lên, tránh ghi đè các field khác bằng undefined
        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (dto.full_name  !== undefined) updates.full_name    = dto.full_name;
        if (dto.email      !== undefined) updates.email        = dto.email;
        if (dto.phone_number !== undefined) updates.phone_number = dto.phone_number;
        if (dto.gender     !== undefined) updates.gender       = dto.gender;
        if (dto.id_number  !== undefined) updates.id_number    = dto.id_number;
        if (dto.avatar_url !== undefined) updates.avatar_url   = dto.avatar_url;
        if (dto.date_of_birth !== undefined) updates.date_of_birth = dto.date_of_birth;

        const { data, error } = await this.supabase
            .from('user_profiles')
            .update(updates)
            .eq('user_id', profile.user_id)
            .select('*')
            .single();

        if (error) {
            throw new BadRequestException(error.message);
        }

        return data;
    }

    async getNotifications(authUserId: string) {
        const profile = await this.getUserProfileByAuthId(authUserId);

        const { data, error } = await this.supabase
            .from('notifications')
            .select('*')
            .eq('user_id', profile.user_id)
            .order('created_at', { ascending: false });

        if (error) {
            throw new BadRequestException(error.message);
        }

        return data;
    }

    async markAllNotificationsAsRead(authUserId: string) {
        const profile = await this.getUserProfileByAuthId(authUserId);

        const { error } = await this.supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', profile.user_id)
            .eq('is_read', false); // Chỉ update những cái chưa đọc

        if (error) {
            throw new BadRequestException(error.message);
        }

        return { message: 'Đã đánh dấu tất cả thông báo là đã đọc' };
    }

    async getAddresses(authUserId: string) {
        const profile = await this.getUserProfileByAuthId(authUserId);

        const { data, error } = await this.supabase
            .from('addresses')
            .select('*')
            .eq('user_id', profile.user_id)
            .order('is_default', { ascending: false });

        if (error) {
            throw new BadRequestException(error.message);
        }

        return data;
    }

    async createAddress(authUserId: string, dto: CreateAddressDto) {
        const profile = await this.getUserProfileByAuthId(authUserId);

        if (dto.is_default) {
            await this.supabase
                .from('addresses')
                .update({ is_default: false })
                .eq('user_id', profile.user_id);
        }

        const { data, error } = await this.supabase
            .from('addresses')
            .insert({
                user_id: profile.user_id,
                recipient_name: dto.recipient_name,
                phone_number: dto.phone_number,
                line1: dto.line1,
                line2: dto.line2,
                ward: dto.ward,
                district: dto.district,
                city: dto.city,
                province: dto.province,
                postal_code: dto.postal_code,
                country: dto.country ?? 'Vietnam',
                is_default: dto.is_default ?? false,
            })
            .select('*')
            .single();

        if (error) {
            throw new BadRequestException(error.message);
        }

        return data;
    }

    async updateAddress(
        authUserId: string,
        addressId: string,
        dto: UpdateAddressDto,
    ) {
        const profile = await this.getUserProfileByAuthId(authUserId);

        if (dto.is_default) {
            await this.supabase
                .from('addresses')
                .update({ is_default: false })
                .eq('user_id', profile.user_id);
        }

        const { data, error } = await this.supabase
            .from('addresses')
            .update(dto)
            .eq('address_id', addressId)
            .eq('user_id', profile.user_id)
            .select('*')
            .single();

        if (error) {
            throw new BadRequestException(error.message);
        }

        return data;
    }

    async deleteAddress(authUserId: string, addressId: string) {
        const profile = await this.getUserProfileByAuthId(authUserId);

        // Kiểm tra địa chỉ có tồn tại và thuộc user này không
        const { data: existing, error: fetchError } = await this.supabase
            .from('addresses')
            .select('address_id')
            .eq('address_id', addressId)
            .eq('user_id', profile.user_id)
            .maybeSingle();

        if (fetchError) {
            throw new BadRequestException(fetchError.message);
        }
        if (!existing) {
            throw new NotFoundException('Không tìm thấy địa chỉ này');
        }

        const { error } = await this.supabase
            .from('addresses')
            .delete()
            .eq('address_id', addressId)
            .eq('user_id', profile.user_id);

        if (error) {
            throw new BadRequestException(error.message);
        }

        return { message: 'Đã xóa địa chỉ' };
    }

    async getMyOrders(authUserId: string) {
        const profile = await this.getUserProfileByAuthId(authUserId);

        const { data: renterProfile, error: renterError } = await this.supabase
            .from('renter_profiles')
            .select('renter_profile_id')
            .eq('user_id', profile.user_id)
            .single();

        if (renterError || !renterProfile) {
            return [];
        }

        const { data, error } = await this.supabase
            .from('rental_orders')
            .select(`
        *,
        rental_order_items (
          *,
          product_variants (
            *,
            products (
              name,
              slug,
              product_images (
                image_url,
                is_primary
              ),
              shop_profiles (
                shop_name
              )
            )
          )
        )
      `)
            .eq('renter_profile_id', renterProfile.renter_profile_id)
            .order('created_at', { ascending: false });

        if (error) {
            throw new BadRequestException(error.message);
        }

        return data;
    }
}