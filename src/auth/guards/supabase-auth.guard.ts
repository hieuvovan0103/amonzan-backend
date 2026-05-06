import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { SupabaseService } from '../../supabase/supabase.service'

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    const authHeader = request.headers.authorization || ''
    console.log('authHeader:', authHeader);

    // 1. Check header có tồn tại không
    if (!authHeader.startsWith('Bearer ')) {
      console.log('Missing Bearer token:', request.headers);
      throw new UnauthorizedException('Thiếu access token')
    }

    // 2. Lấy token
    const token = authHeader.replace('Bearer ', '').trim()

    // 3. Verify với Supabase
    const { data, error } =
      await this.supabaseService.client.auth.getUser(token)

    if (error || !data.user) {
      console.error('Supabase auth error:', error, 'data:', data);
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn')
    }

    // 4. Gắn user vào request
    request.user = data.user

    return true
  }
}