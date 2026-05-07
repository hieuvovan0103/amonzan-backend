import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { AdminDisputesService } from "./admin-disputes.service";
import { ListDisputesQueryDto } from "./dto/list-disputes-query.dto";
import { RequestMoreEvidenceDto } from "./dto/request-more-evidence.dto";
import { ResolveDisputeDto } from "./dto/resolve-dispute.dto";

@ApiTags("admin-disputes")
@ApiBearerAuth()
@Controller("admin/disputes")
@UseGuards(SupabaseAuthGuard)
export class AdminDisputesController {
    constructor(private readonly adminDisputesService: AdminDisputesService) {}

    @Get()
    @ApiOperation({ summary: "List escalated disputes for admin." })
    listDisputes(@CurrentUser() user: any, @Query() query: ListDisputesQueryDto) {
        return this.adminDisputesService.listDisputes(user.id, query);
    }

    @Get(":id")
    @ApiOperation({ summary: "Get dispute detail for admin." })
    getDisputeDetail(@CurrentUser() user: any, @Param("id") disputeId: string) {
        return this.adminDisputesService.getDisputeDetail(user.id, disputeId);
    }

    @Patch(":id/request-evidence")
    @ApiOperation({ summary: "Request more evidence for a dispute." })
    requestMoreEvidence(
        @CurrentUser() user: any,
        @Param("id") disputeId: string,
        @Body() dto: RequestMoreEvidenceDto,
    ) {
        return this.adminDisputesService.requestMoreEvidence(user.id, disputeId, dto);
    }

    @Patch(":id/resolve")
    @ApiOperation({ summary: "Resolve a dispute with final admin decision." })
    resolveDispute(
        @CurrentUser() user: any,
        @Param("id") disputeId: string,
        @Body() dto: ResolveDisputeDto,
    ) {
        return this.adminDisputesService.resolveDispute(user.id, disputeId, dto);
    }
}
