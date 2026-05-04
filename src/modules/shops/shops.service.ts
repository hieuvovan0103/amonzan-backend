import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class ShopsService {
    constructor(private readonly supabase: SupabaseService) { }

    async getShopByAuthUserId(authUserId: string) {
        const client = this.supabase.client;

        const { data: userProfile, error: userError } = await client
            .from('user_profiles')
            .select('user_id, auth_user_id, primary_role')
            .eq('auth_user_id', authUserId)
            .single();

        if (userError || !userProfile) {
            throw new NotFoundException('Không tìm thấy hồ sơ người dùng.');
        }

        const { data: shop, error: shopError } = await client
            .from('shop_profiles')
            .select('*')
            .eq('user_id', userProfile.user_id)
            .single();

        if (shopError || !shop) {
            throw new ForbiddenException('Tài khoản này chưa có hồ sơ cửa hàng.');
        }

        return shop;
    }

    async getActiveShopByAuthUserId(authUserId: string) {
        const shop = await this.getShopByAuthUserId(authUserId);

        if (!shop.is_active) {
            throw new ForbiddenException('Cửa hàng hiện đang bị tạm khóa.');
        }

        return shop;
    }

    async assertProductBelongsToShop(productId: string, shopId: string) {
        const client = this.supabase.client;

        const { data: product, error } = await client
            .from('products')
            .select('product_id, shop_id')
            .eq('product_id', productId)
            .single();

        if (error || !product) {
            throw new NotFoundException('Không tìm thấy sản phẩm.');
        }

        if (product.shop_id !== shopId) {
            throw new ForbiddenException(
                'Bạn không có quyền thao tác với sản phẩm này.',
            );
        }

        return product;
    }
}
