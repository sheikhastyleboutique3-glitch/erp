import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DeliveriesService } from './deliveries.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DeliveryStatus, Role } from '@prisma/client';

export class AssignDto {
  @IsInt() orderId: number;
  @IsOptional() @IsInt() driverId?: number | null;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() notes?: string;
}
export class StatusDto {
  @IsEnum(DeliveryStatus) status: DeliveryStatus;
}

const MANAGE: Role[] = [Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.CASHIER];

@ApiTags('Deliveries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('deliveries')
export class DeliveriesController {
  constructor(private svc: DeliveriesService) {}

  @Get()
  list(
    @Query('branchId') branchId?: string,
    @Query('driverId') driverId?: string,
    @Query('status') status?: DeliveryStatus,
  ) {
    return this.svc.list({
      branchId: branchId ? parseInt(branchId, 10) : undefined,
      driverId: driverId ? parseInt(driverId, 10) : undefined,
      status,
    });
  }

  @Get('mine')
  mine(@CurrentUser('id') userId: number) {
    return this.svc.mine(userId);
  }

  @Post('assign') @Roles(...MANAGE)
  assign(@Body() dto: AssignDto) {
    return this.svc.assign(dto.orderId, dto.driverId ?? null, { address: dto.address, phone: dto.phone, notes: dto.notes });
  }

  @Patch(':id/status')
  setStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: StatusDto, @CurrentUser() user: any) {
    // Drivers are constrained to their own runs; managers can override.
    const driverId = user?.role === Role.DRIVER ? user.id : undefined;
    return this.svc.setStatus(id, dto.status, driverId);
  }
}
