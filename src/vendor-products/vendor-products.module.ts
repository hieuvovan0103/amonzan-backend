import { Module } from '@nestjs/common';
import { CategoriesModule } from '../modules/categories/categories.module';
import { VendorProductsController } from './vendor-products.controller';
import { VendorProductsService } from './vendor-products.service';

@Module({
    imports: [CategoriesModule],
    controllers: [VendorProductsController],
    providers: [VendorProductsService],
})
export class VendorProductsModule { }
