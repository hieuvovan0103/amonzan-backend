import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";
import { ReportReviewDto } from "./dto/report-review.dto";

@Injectable()
export class ReviewsService {
    constructor(private readonly supabaseService: SupabaseService) {}

    async report(authUserId: string | undefined, reviewId: string, dto: ReportReviewDto) {
        if (!authUserId) {
            throw new UnauthorizedException("Bạn cần đăng nhập để báo cáo đánh giá.");
        }

        const supabase = this.supabaseService.client;
        const { data: profile, error: profileError } = await supabase
            .from("user_profiles")
            .select("user_id")
            .eq("auth_user_id", authUserId)
            .single();

        if (profileError || !profile) {
            throw new UnauthorizedException("Không tìm thấy hồ sơ người dùng.");
        }

        const { data: review, error: reviewError } = await supabase
            .from("reviews")
            .select("review_id, is_hidden")
            .eq("review_id", reviewId)
            .single();

        if (reviewError || !review) {
            throw new NotFoundException("Không tìm thấy đánh giá.");
        }

        if (review.is_hidden) {
            throw new BadRequestException("Đánh giá này đã bị ẩn.");
        }

        const { error } = await supabase
            .from("reviews")
            .update({
                reported_at: new Date().toISOString(),
                reported_by_user_id: profile.user_id,
                report_reason: dto.reason.trim(),
                report_status: "PENDING",
                updated_at: new Date().toISOString(),
            })
            .eq("review_id", reviewId);

        if (error) {
            throw new BadRequestException(`Không thể báo cáo đánh giá: ${error.message}`);
        }

        return { success: true };
    }
}
