import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private svc: AnalyticsService) {}

  @Get('sales-summary')
  salesSummary(
    @Query('branchId') branchId?: string,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.salesSummary({
      branchId: branchId ? parseInt(branchId, 10) : undefined,
      period,
      from,
      to,
    });
  }

  @Get('best-sellers')
  bestSellers(
    @Query('branchId') branchId?: string,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.bestSellers({
      branchId: branchId ? parseInt(branchId, 10) : undefined,
      period,
      from,
      to,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('top-customers')
  topCustomers(
    @Query('branchId') branchId?: string,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.topCustomers({
      branchId: branchId ? parseInt(branchId, 10) : undefined,
      period,
      from,
      to,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
