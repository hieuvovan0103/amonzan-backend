import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
    constructor(private readonly supabase: SupabaseService) { }

    async findAll() {
        const client = this.supabase.client;

        const { data, error } = await client
            .from('categories')
            .select('category_id, name, slug, description, is_active, created_at, updated_at')
            .eq('is_active', true)
            .order('name', { ascending: true });

        if (error) {
            throw error;
        }

        return data;
    }

    async findAllForAdmin(authUserId: string) {
        await this.assertAdmin(authUserId);

        const { data, error } = await this.supabase.client
            .from('categories')
            .select('category_id, name, slug, description, is_active, created_at, updated_at')
            .order('created_at', { ascending: false });

        if (error) {
            throw new BadRequestException(error.message);
        }

        return data ?? [];
    }

    async create(authUserId: string, dto: CreateCategoryDto) {
        await this.assertAdmin(authUserId);

        const { data, error } = await this.supabase.client
            .from('categories')
            .insert({
                name: dto.name.trim(),
                slug: dto.slug.trim(),
                description: dto.description?.trim() || null,
                is_active: dto.is_active ?? true,
            })
            .select('category_id, name, slug, description, is_active, created_at, updated_at')
            .single();

        if (error) {
            throw new BadRequestException(`Không thể tạo danh mục: ${error.message}`);
        }

        return data;
    }

    async update(authUserId: string, categoryId: string, dto: UpdateCategoryDto) {
        await this.assertAdmin(authUserId);

        const updates: Record<string, any> = {
            updated_at: new Date().toISOString(),
        };

        if (dto.name !== undefined) updates.name = dto.name.trim();
        if (dto.slug !== undefined) updates.slug = dto.slug.trim();
        if (dto.description !== undefined) updates.description = dto.description?.trim() || null;
        if (dto.is_active !== undefined) updates.is_active = dto.is_active;

        const { data, error } = await this.supabase.client
            .from('categories')
            .update(updates)
            .eq('category_id', categoryId)
            .select('category_id, name, slug, description, is_active, created_at, updated_at')
            .single();

        if (error || !data) {
            throw new BadRequestException(`Không thể cập nhật danh mục: ${error?.message || 'Unknown error'}`);
        }

        return data;
    }

    async softDelete(authUserId: string, categoryId: string) {
        return this.update(authUserId, categoryId, { is_active: false });
    }

    async assertActiveCategory(categoryId: string) {
        const { data, error } = await this.supabase.client
            .from('categories')
            .select('category_id, is_active')
            .eq('category_id', categoryId)
            .eq('is_active', true)
            .single();

        if (error || !data) {
            throw new BadRequestException('Danh mục không tồn tại hoặc đã bị tắt.');
        }

        return data;
    }

    private async assertAdmin(authUserId: string) {
        const { data: profile, error } = await this.supabase.client
            .from('user_profiles')
            .select(`
                user_id,
                user_roles (
                    roles (
                        role_name
                    )
                )
            `)
            .eq('auth_user_id', authUserId)
            .single();

        if (error || !profile) {
            throw new NotFoundException('Không tìm thấy hồ sơ người dùng');
        }

        const roles = (profile.user_roles ?? [])
            .map((userRole: any) => {
                const role = Array.isArray(userRole.roles)
                    ? userRole.roles[0]
                    : userRole.roles;
                return role?.role_name;
            })
            .filter(Boolean);

        if (!roles.includes('ADMIN')) {
            throw new ForbiddenException('Chỉ admin mới được quản lý danh mục');
        }

        return profile;
    }
}
