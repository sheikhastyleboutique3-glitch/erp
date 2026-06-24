import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PosSessionsService } from './pos-sessions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

export class OpenSessionDto {
  @IsNumber() branchId: number;
  @IsOptional() @IsNumber() @Min(0) openingFloat?: number;
}
export class CashMovementDto {
  @IsIn(['CASH_IN', 'CASH_OUT']) type: 'CASH_IN' | 'CASH_OUT';
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsString() reason?: string;
}
export class CloseSessionDto {
  @IsNumber() @Min(0) closingCounted: number;
}

const POS_ROLES: Role[] = [Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.CASHIER];

@ApiTags('POS Sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pos-sessions')
export class PosSessionsController {
  constructor(private svc: PosSessionsService) {}

  @Get('current')
  current(@Query('branchId', ParseIntPipe) branchId: number) {
    return this.svc.current(branchId);
  }

  @Get()
  list(@Query('branchId') branchId?: string) {
    return this.svc.list(branchId ? parseInt(branchId, 10) : undefined);
  }

  @Get(':id/report')
  report(@Param('id', ParseIntPipe) id: number) {
    return this.svc.report(id);
  }

  @Post('open') @Roles(...POS_ROLES)
  open(@Body() dto: OpenSessionDto, @CurrentUser('id') userId: number) {
    return this.svc.open(dto.branchId, dto.openingFloat ?? 0, userId);
  }

  @Post(':id/cash') @Roles(...POS_ROLES)
  cash(@Param('id', ParseIntPipe) id: number, @Body() dto: CashMovementDto, @CurrentUser('id') userId: number) {
    return this.svc.addCashMovement(id, dto.type, dto.amount, dto.reason, userId);
  }

  @Post(':id/close') @Roles(...POS_ROLES)
  close(@Param('id', ParseIntPipe) id: number, @Body() dto: CloseSessionDto, @CurrentUser('id') userId: number) {
    return this.svc.close(id, dto.closingCounted, userId);
  }
}
