import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { FinanceEntryType, Role } from '@prisma/client';

const FINANCE_ROLES: Role[] = [Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.PROCUREMENT];

@ApiTags('Finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finance')
export class FinanceController {
  constructor(private svc: FinanceService) {}

  @Get('entries') @Roles(...FINANCE_ROLES)
  entries(
    @Query('branchId') branchId?: string,
    @Query('type') type?: FinanceEntryType,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.findAll({
      branchId: branchId ? parseInt(branchId, 10) : undefined,
      type,
      from,
      to,
    });
  }

  @Get('summary') @Roles(...FINANCE_ROLES)
  summary(
    @Query('branchId') branchId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.summary({
      branchId: branchId ? parseInt(branchId, 10) : undefined,
      from,
      to,
    });
  }
}
