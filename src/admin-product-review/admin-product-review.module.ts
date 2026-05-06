import { Module } from '@nestjs/common';
import { AdminProductReviewController } from './admin-product-review.controller';
import { AdminProductReviewService } from './admin-product-review.service';

@Module({
  controllers: [AdminProductReviewController],
  providers: [AdminProductReviewService],
})
export class AdminProductReviewModule {}
