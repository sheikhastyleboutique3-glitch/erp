import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ReceivablesService } from './receivables.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

const VIEW: Role[] = [Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.PROCUREMENT, Role.CASHIER];

@ApiTags('Receivables')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...VIEW)
@Controller('receivables')
export class ReceivablesController {
  constructor(private svc: ReceivablesService) {}

  @Get()
  list(@Query('branchId') branchId?: string, @Query('customerId') customerId?: string) {
    return this.svc.list({
      branchId: branchId ? parseInt(branchId, 10) : undefined,
      customerId: customerId ? parseInt(customerId, 10) : undefined,
    });
  }

  @Get('aging')
  aging(@Query('branchId') branchId?: string) {
    return this.svc.aging(branchId ? parseInt(branchId, 10) : undefined);
  }
}
