import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class CategoriesService {
    constructor(private readonly supabase: SupabaseService) { }

    async findAll() {
        const client = this.supabase.client;

        const { data, error } = await client
            .from('categories')
            .select('category_id, name, slug, description')
            .order('name', { ascending: true });

        if (error) {
            throw error;
        }

        return data;
    }
}
