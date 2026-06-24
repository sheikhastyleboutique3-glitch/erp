import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { IsNumber, Min } from 'class-validator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PayablesService } from './payables.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

export class PayDto {
  @IsNumber() @Min(0.01) amount: number;
}

const MANAGE: Role[] = [Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.PROCUREMENT];

@ApiTags('Payables')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...MANAGE)
@Controller('payables')
export class PayablesController {
  constructor(private svc: PayablesService) {}

  @Get()
  list(@Query('branchId') branchId?: string, @Query('supplierId') supplierId?: string) {
    return this.svc.list({
      branchId: branchId ? parseInt(branchId, 10) : undefined,
      supplierId: supplierId ? parseInt(supplierId, 10) : undefined,
    });
  }

  @Get('aging')
  aging(@Query('branchId') branchId?: string) {
    return this.svc.aging(branchId ? parseInt(branchId, 10) : undefined);
  }

  @Post(':id/payment')
  pay(@Param('id', ParseIntPipe) id: number, @Body() dto: PayDto) {
    return this.svc.recordPayment(id, dto.amount);
  }
}
