import { BadRequestException, Injectable } from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service'

@Injectable()
export class AuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private normalizePhoneNumber(phoneNumber?: string | null) {
    if (!phoneNumber) return null

    const trimmedPhone = phoneNumber.trim()
    if (!trimmedPhone) return null

    let digits = trimmedPhone.replace(/\D/g, '')

    if (digits.startsWith('84')) {
      digits = digits.slice(2)
    } else if (digits.startsWith('0')) {
      digits = digits.slice(1)
    }

    if (!digits || digits.length < 8 || digits.length > 11) {
      return null
    }

    return `+84${digits}`
  }

  private getPhoneSyncState(authUser: any, fallbackPhoneNumber?: string | null) {
    const authPhoneNumber = this.normalizePhoneNumber(authUser.phone)
    const fallbackPhone = this.normalizePhoneNumber(fallbackPhoneNumber)

    return {
      phoneNumber: authPhoneNumber ?? fallbackPhone,
      isPhoneVerified: Boolean(authPhoneNumber && authUser.phone_confirmed_at),
    }
  }

  private async syncPhoneProfile(authUser: any, fallbackPhoneNumber?: string | null) {
    const supabase = this.supabaseService.client

    const { data: currentProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('user_id, phone_number, is_phone_verified')
      .eq('auth_user_id', authUser.id)
      .maybeSingle()

    if (profileError) {
      console.error('[syncPhoneProfile] Fetch profile error:', profileError)
      throw new BadRequestException(profileError.message)
    }

    if (!currentProfile) {
      throw new BadRequestException('Khong tim thay profile nguoi dung')
    }

    const nextPhoneState = this.getPhoneSyncState(
      authUser,
      fallbackPhoneNumber ?? currentProfile.phone_number,
    )

    const nextPhoneNumber = nextPhoneState.phoneNumber ?? currentProfile.phone_number
    const nextIsPhoneVerified = nextPhoneState.isPhoneVerified

    if (
      currentProfile.phone_number === nextPhoneNumber &&
      currentProfile.is_phone_verified === nextIsPhoneVerified
    ) {
      return {
        ...currentProfile,
        phone_number: nextPhoneNumber,
        is_phone_verified: nextIsPhoneVerified,
      }
    }

    const { data: updatedProfile, error: updateError } = await supabase
      .from('user_profiles')
      .update({
        phone_number: nextPhoneNumber,
        is_phone_verified: nextIsPhoneVerified,
      })
      .eq('user_id', currentProfile.user_id)
      .select('user_id, phone_number, is_phone_verified')
      .single()

    if (updateError) {
      console.error('[syncPhoneProfile] Update profile error:', updateError)
      throw new BadRequestException(updateError.message)
    }

    return updatedProfile
  }

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
      console.error('[bootstrapProfile] Check existing error:', existingError)
      throw new BadRequestException(existingError.message)
    }

    if (existingProfile) {
      const syncedProfile = await this.syncPhoneProfile(authUser, body.phoneNumber)

      return {
        message: 'Profile da ton tai',
        profile: {
          ...existingProfile,
          phone_number: syncedProfile.phone_number,
          is_phone_verified: syncedProfile.is_phone_verified,
        },
      }
    }

    const initialPhoneState = this.getPhoneSyncState(authUser, body.phoneNumber)

    const { data: createdProfile, error: createProfileError } = await supabase
      .from('user_profiles')
      .insert({
        auth_user_id: authUser.id,
        email: authUser.email,
        full_name: body.fullName || authUser.user_metadata?.full_name || null,
        phone_number: initialPhoneState.phoneNumber,
        is_email_verified: !!authUser.email_confirmed_at,
        is_phone_verified: initialPhoneState.isPhoneVerified,
      })
      .select()
      .single()

    if (createProfileError) {
      console.error('[bootstrapProfile] Insert user_profiles error:', createProfileError)
      throw new BadRequestException(createProfileError.message)
    }

    const { data: renterRole, error: roleError } = await supabase
      .from('roles')
      .select('*')
      .eq('role_name', 'RENTER')
      .maybeSingle()

    if (roleError || !renterRole) {
      console.error('[bootstrapProfile] Role RENTER fetch error or missing:', roleError)
      throw new BadRequestException(roleError?.message || 'Role RENTER not found in database')
    }

    const { error: insertRoleError } = await supabase.from('user_roles').insert({
      user_id: createdProfile.user_id,
      role_id: renterRole.role_id,
    })

    if (insertRoleError) {
      console.error('[bootstrapProfile] Insert user_roles error:', insertRoleError)
      throw new BadRequestException(insertRoleError.message)
    }

    const { error: renterProfileError } = await supabase
      .from('renter_profiles')
      .insert({
        user_id: createdProfile.user_id,
      })

    if (renterProfileError) {
      console.error('[bootstrapProfile] Insert renter_profiles error:', renterProfileError)
      throw new BadRequestException(renterProfileError.message)
    }

    return {
      message: 'Tao profile thanh cong',
      profile: createdProfile,
    }
  }

  async getMe(authUser: any) {
    const supabase = this.supabaseService.client

    await this.syncPhoneProfile(authUser)

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select(`
        *,
        user_roles (
          role_id,
          roles (
            role_name
          )
        ),
        shop_profiles (
          shop_id,
          verification_status
        )
      `)
      .eq('auth_user_id', authUser.id)
      .maybeSingle()

    if (error) {
      console.error('[getMe] Error fetching user_profiles:', error)
      throw new BadRequestException(error.message)
    }

    return {
      authUser: {
        id: authUser.id,
        email: authUser.email,
        phone: authUser.phone ?? null,
        phoneConfirmedAt: authUser.phone_confirmed_at ?? null,
      },
      profile: profile || null,
    }
  }

  async updateProfile(
    authUser: any,
    body: { fullName?: string; phoneNumber?: string; idNumber?: string },
  ) {
    const supabase = this.supabaseService.client

    const { data: existingProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('user_id, email, phone_number')
      .eq('auth_user_id', authUser.id)
      .maybeSingle()

    if (profileError || !existingProfile) {
      throw new BadRequestException('Khong tim thay profile nguoi dung')
    }

    const normalizedPhoneNumber = this.normalizePhoneNumber(body.phoneNumber)
    const nextPhoneNumber = normalizedPhoneNumber ?? existingProfile.phone_number
    const confirmedAuthPhone = this.normalizePhoneNumber(authUser.phone)
    const isVerifiedPhone =
      Boolean(confirmedAuthPhone && authUser.phone_confirmed_at) &&
      confirmedAuthPhone === nextPhoneNumber

    const { data: updatedProfile, error: updateError } = await supabase
      .from('user_profiles')
      .update({
        full_name: body.fullName?.trim() || null,
        phone_number: nextPhoneNumber,
        id_number: body.idNumber?.trim() || null,
        is_phone_verified: isVerifiedPhone,
      })
      .eq('user_id', existingProfile.user_id)
      .select()
      .single()

    if (updateError) {
      console.error('[updateProfile] Update profile error:', updateError)
      throw new BadRequestException(updateError.message)
    }

    return {
      message: 'Cap nhat profile thanh cong',
      profile: updatedProfile,
    }
  }

  async startPhoneVerification(authUser: any, body: { phoneNumber: string }) {
    const supabase = this.supabaseService.client
    const normalizedPhoneNumber = this.normalizePhoneNumber(body.phoneNumber)

    if (!normalizedPhoneNumber || normalizedPhoneNumber.length < 10) {
      throw new BadRequestException('So dien thoai khong hop le')
    }

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('auth_user_id', authUser.id)
      .maybeSingle()

    if (profileError || !profile) {
      throw new BadRequestException('Khong tim thay profile nguoi dung')
    }

    const { data: updatedProfile, error: updateError } = await supabase
      .from('user_profiles')
      .update({
        phone_number: normalizedPhoneNumber,
        is_phone_verified: false,
      })
      .eq('user_id', profile.user_id)
      .select('user_id, phone_number, is_phone_verified')
      .single()

    if (updateError) {
      console.error('[startPhoneVerification] Update error:', updateError)
      throw new BadRequestException(updateError.message)
    }

    return {
      message: `Da khoi tao xac minh so dien thoai ${normalizedPhoneNumber}`,
      profile: updatedProfile,
    }
  }

  async syncPhoneVerification(authUser: any) {
    const syncedProfile = await this.syncPhoneProfile(authUser)

    return {
      message: syncedProfile.is_phone_verified
        ? 'Dong bo xac minh so dien thoai thanh cong'
        : 'So dien thoai chua duoc xac minh tren Supabase Auth',
      profile: syncedProfile,
    }
  }
}
