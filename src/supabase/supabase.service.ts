import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * SupabaseService — wrapper cho Supabase JS client.
 *
 * Inject service này vào bất kỳ NestJS service nào để truy cập database:
 *
 * @example
 * constructor(private readonly supabaseService: SupabaseService) {}
 *
 * async findAll() {
 *   const { data, error } = await this.supabaseService.client
 *     .from('products')
 *     .select('*');
 *   if (error) throw error;
 *   return data;
 * }
 */
@Injectable()
export class SupabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly supabaseClient: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.getOrThrow<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.getOrThrow<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    this.supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        // Backend service — không cần lưu session
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    this.logger.log(`Supabase client initialized: ${supabaseUrl}`);
  }

  /**
   * Supabase client dùng service_role key (bypass RLS).
   * Dùng cho tất cả business logic ở backend.
   */
  get client(): SupabaseClient {
    return this.supabaseClient;
  }

  onModuleDestroy() {
    this.logger.log('SupabaseService destroyed');
  }
}
