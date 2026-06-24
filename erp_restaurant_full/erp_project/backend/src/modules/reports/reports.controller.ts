import { Controller, Get, Query, Param, UseGuards, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { Response } from 'express';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private svc: ReportsService) {}

  // Analytics endpoints — management roles only
  @Get('wastage-summary')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.PROCUREMENT)
  wastageSummary(
    @Query('branchId') branchId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.wastageSummary(branchId ? +branchId : undefined, from, to);
  }

  // Requirement #2: per-location financial summary (stock value + cash float).
  @Get('financials')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.PROCUREMENT, Role.WAREHOUSE)
  financials(@Query('branchId') branchId?: string) {
    return this.svc.financials(branchId ? +branchId : undefined);
  }

  @Get('cost-variance')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.PROCUREMENT)
  costVariance(@Query('branchId') branchId?: string) {
    return this.svc.costVariance(branchId ? +branchId : undefined);
  }

  @Get('high-consumption')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.PROCUREMENT)
  highConsumption(
    @Query('branchId') branchId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.highConsumption(branchId ? +branchId : undefined, limit ? +limit : 10);
  }

  @Get('purchase-order-stats')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.PROCUREMENT, Role.WAREHOUSE)
  purchaseOrderStats(@Query('branchId') branchId?: string) {
    return this.svc.getPurchaseOrderStats(branchId ? +branchId : undefined);
  }

  /**
   * CSV export — open to all management + warehouse roles.
   * Uses @Res() with manual send so the CSV bytes are streamed directly
   * without being wrapped in the global { success, data } interceptor.
   */
  @Get('export/:type/csv')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.PROCUREMENT, Role.WAREHOUSE)
  async exportCsv(
    @Param('type') type: string,
    @Query('branchId') branchId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('reason') reason?: string,
    @Query('priority') priority?: string,
    @Query('department') department?: string,
    @Query('productId') productId?: string,
    @Res() res?: Response,
  ) {
    const validTypes = ['requisitions', 'inventory', 'purchase-orders', 'wastage', 'expiry-alerts', 'low-stock'];
    if (!validTypes.includes(type)) {
      res.status(400).json({ message: `Invalid export type. Valid: ${validTypes.join(', ')}` });
      return;
    }

    try {
      const csv = await this.svc.exportCsv(type, {
        branchId: branchId ? +branchId : undefined,
        from,
        to,
        search: search || undefined,
        status: status || undefined,
        supplierId: supplierId ? +supplierId : undefined,
        categoryId: categoryId ? +categoryId : undefined,
        reason: reason || undefined,
        priority: priority || undefined,
        department: department || undefined,
        productId: productId ? +productId : undefined,
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${type}-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      res.end(csv);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || 'Export failed' });
    }
  }

  /** JSON export (legacy) */
  @Get('export/:type')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.PROCUREMENT, Role.WAREHOUSE)
  async exportData(
    @Param('type') type: string,
    @Query('branchId') branchId?: string,
    @Res() res?: Response,
  ) {
    try {
      const data = await this.svc.exportData(type, branchId ? +branchId : undefined);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-export.json"`);
      res.end(JSON.stringify(data, null, 2));
    } catch (err: any) {
      res.status(500).json({ message: err?.message || 'Export failed' });
    }
  }
}
