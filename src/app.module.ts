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
import { AdminProductReviewModule } from './admin-product-review/admin-product-review.module';
import { ProductReviewsModule } from './product-reviews/product-reviews.module';
import { AdminReviewsModule } from './admin-reviews/admin-reviews.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ReturnsModule } from './returns/returns.module';
import { AdminDisputesModule } from './admin-disputes/admin-disputes.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

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
    AdminProductReviewModule,
    ProductReviewsModule,
    AdminReviewsModule,
    ReviewsModule,
    NotificationsModule,
    ReturnsModule,
    AdminDisputesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }

