import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { ReplyReviewDto } from "./dto/reply-review.dto";
import { ReportReviewDto } from "./dto/report-review.dto";
import { ReviewsService } from "./reviews.service";

@ApiTags("reviews")
@ApiBearerAuth()
@Controller("reviews")
@UseGuards(SupabaseAuthGuard)
export class ReviewsController {
    constructor(private readonly service: ReviewsService) {}

    @Post(":reviewId/report")
    @ApiOperation({ summary: "Report a review to admin." })
    reportReview(
        @CurrentUser() user: any,
        @Param("reviewId") reviewId: string,
        @Body() dto: ReportReviewDto,
    ) {
        return this.service.report(user.id, reviewId, dto);
    }

    @Post(":reviewId/reply")
    @ApiOperation({ summary: "Create or update the shop reply for a product review." })
    replyReview(
        @CurrentUser() user: any,
        @Param("reviewId") reviewId: string,
        @Body() dto: ReplyReviewDto,
    ) {
        return this.service.reply(user.id, reviewId, dto);
    }
}
