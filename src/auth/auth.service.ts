// src/auth/auth.service.ts
import { Injectable, BadRequestException } from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service'

@Injectable()
export class AuthService {
  constructor(private readonly supabaseService: SupabaseService) { }

  async bootstrapProfile(
    authUser: any,
    body: { fullName?: string; phoneNumber?: string },
  ) {
    const supabase = this.supabaseService.client

    const { data: existingProfile, error: existingError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('auth_user_id', authUser.id)
      .maybeSingle()

    if (existingError) {
      console.error('[bootstrapProfile] Check existing error:', existingError);
      throw new BadRequestException(existingError.message)
    }

    if (existingProfile) {
      return {
        message: 'Profile đã tồn tại',
        profile: existingProfile,
      }
    }

    const { data: createdProfile, error: createProfileError } = await supabase
      .from('user_profiles')
      .insert({
        auth_user_id: authUser.id,
        email: authUser.email,
        full_name: body.fullName || authUser.user_metadata?.full_name || null,
        phone_number: body.phoneNumber || null,
        is_email_verified: !!authUser.email_confirmed_at,
      })
      .select()
      .single()

    if (createProfileError) {
      console.error('[bootstrapProfile] Insert user_profiles error:', createProfileError);
      throw new BadRequestException(createProfileError.message)
    }

    const { data: renterRole, error: roleError } = await supabase
      .from('roles')
      .select('*')
      .eq('role_name', 'RENTER')
      .maybeSingle()

    if (roleError || !renterRole) {
      console.error('[bootstrapProfile] Role RENTER fetch error or missing:', roleError);
      throw new BadRequestException(roleError?.message || 'Role RENTER not found in database')
    }

    const { error: insertRoleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: createdProfile.user_id,
        role_id: renterRole.role_id,
      })

    if (insertRoleError) {
      console.error('[bootstrapProfile] Insert user_roles error:', insertRoleError);
      throw new BadRequestException(insertRoleError.message)
    }

    const { error: renterProfileError } = await supabase
      .from('renter_profiles')
      .insert({
        user_id: createdProfile.user_id,
      })

    if (renterProfileError) {
      console.error('[bootstrapProfile] Insert renter_profiles error:', renterProfileError);
      throw new BadRequestException(renterProfileError.message)
    }

    return {
      message: 'Tạo profile thành công',
      profile: createdProfile,
    }
  }

  async getMe(authUser: any) {
    const supabase = this.supabaseService.client

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select(`
        *,
        user_roles (
          role_id,
          roles (
            role_name
          )
        )
      `)
      .eq('auth_user_id', authUser.id)
      .maybeSingle()

    if (error) {
      console.error('[getMe] Error fetching user_profiles:', error);
      throw new BadRequestException(error.message)
    }

    return {
      authUser: {
        id: authUser.id,
        email: authUser.email,
      },
      profile: profile || null,
    }
  }
}