import { Module } from '@nestjs/common';
import { ProductReviewsModule } from '../product-reviews/product-reviews.module';
import { AdminReviewsController } from './admin-reviews.controller';
import { AdminReviewsService } from './admin-reviews.service';

@Module({
  imports: [ProductReviewsModule],
  controllers: [AdminReviewsController],
  providers: [AdminReviewsService],
})
export class AdminReviewsModule {}
