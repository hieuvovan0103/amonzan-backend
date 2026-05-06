import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { VendorsModule } from './vendors/vendors.module';
import { ProfileModule } from './profile/profile.module';
import { VendorProductsModule } from './vendor-products/vendor-products.module';
import { ProductsModule } from './modules/products/products.module';
import { ShopsModule } from './modules/shops/shops.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    // Load .env globally — phải đặt trước tất cả module khác
    ConfigModule.forRoot({ isGlobal: true }),
    // Supabase client — @Global() nên dùng được ở toàn app
    SupabaseModule,
    AuthModule,
    VendorsModule,
    ProfileModule,
    ProductsModule,
    VendorProductsModule,
    ShopsModule,
    CategoriesModule,
    OrdersModule,
    PaymentsModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }

