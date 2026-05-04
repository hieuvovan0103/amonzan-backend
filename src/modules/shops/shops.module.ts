import { Module } from '@nestjs/common';
import { ShopsService } from './shops.service';
import { SupabaseModule } from '../../supabase/supabase.module';

@Module({
    imports: [SupabaseModule],
    providers: [ShopsService],
    exports: [ShopsService],
})
export class ShopsModule { }