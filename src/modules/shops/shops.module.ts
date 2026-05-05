import { Module } from '@nestjs/common';
import { ShopsService } from './shops.service';
import { SupabaseModule } from '../../supabase/supabase.module';
import { ShopsController } from './shops.controller';

@Module({
    imports: [SupabaseModule],
    controllers: [ShopsController],
    providers: [ShopsService],
    exports: [ShopsService],
})
export class ShopsModule { }
