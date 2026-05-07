import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: unknown;
    }>();

    const rawAuthHeader = request.headers.authorization;
    const authHeader = Array.isArray(rawAuthHeader)
      ? rawAuthHeader[0]
      : (rawAuthHeader ?? '');

    // 1. Check header có tồn tại không
    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Thiếu access token');
    }

    // 2. Lấy token
    const token = authHeader.replace('Bearer ', '').trim();

    // 3. Verify với Supabase
    const { data, error } =
      await this.supabaseService.client.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }

    // 4. Gắn user vào request
    request.user = data.user;

    return true;
  }
}
