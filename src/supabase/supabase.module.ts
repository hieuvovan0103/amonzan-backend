import { Global, Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

/**
 * SupabaseModule (Global) — import một lần trong AppModule, dùng được ở toàn app.
 *
 * Vì có @Global(), các module khác KHÔNG cần import SupabaseModule,
 * chỉ cần inject SupabaseService vào constructor là dùng được.
 */
@Global()
@Module({
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class SupabaseModule {}
