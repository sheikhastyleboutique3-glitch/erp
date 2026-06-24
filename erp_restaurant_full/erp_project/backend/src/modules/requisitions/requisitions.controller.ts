import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { RequisitionStatus, Role } from '@prisma/client';
import { RequisitionsService } from './requisitions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class CreateRequisitionItemDto {
  @IsInt() @IsPositive() @Type(() => Number) productId: number;
  @IsNumber() @Min(0.01) @Type(() => Number) requestedQty: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) unitId?: number;
  @IsOptional() @IsString() notes?: string;
}
class CreateRequisitionDto {
  @IsInt() @IsPositive() @Type(() => Number) branchId: number;
  @IsString() department: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() neededBy?: string;
  @IsOptional() @IsString() priority?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateRequisitionItemDto) items: CreateRequisitionItemDto[];
}
class ManagerReviewDto {
  @IsEnum(['approve', 'modify', 'cancel']) action: 'approve' | 'modify' | 'cancel';
  @IsOptional() @IsArray() items?: any[];
  @IsOptional() @IsString() reviewNotes?: string;
}
class ProcurementUpdateDto {
  @IsEnum(RequisitionStatus) status: RequisitionStatus;
  @IsOptional() @IsInt() @Type(() => Number) driverId?: number;
  @IsOptional() @IsString() driverName?: string;
  @IsOptional() @IsString() driverPhone?: string;
  @IsOptional() @IsString() recipientName?: string;
  @IsOptional() @IsString() trackingNotes?: string;
}

@ApiTags('Requisitions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('requisitions')
export class RequisitionsController {
  constructor(private svc: RequisitionsService) {}

  @Get() findAll(
    @CurrentUser() user: any,
    @Query('status') status?: RequisitionStatus,
    @Query('branchId') branchId?: string,
    @Query('search') search?: string,
    @Query('priority') priority?: string,
    @Query('department') department?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.findAll(user, status, branchId ? +branchId : undefined, { search, priority, department, from, to });
  }
  @Get('stats') stats(
    @CurrentUser() user: any,
    @Query('branchId') branchId?: string,
  ) { return this.svc.getDashboardStats(user, branchId ? +branchId : undefined); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
  @Post() @Roles(Role.KITCHEN, Role.BARISTA, Role.PASTRY, Role.CASHIER, Role.CLEANER, Role.BRANCH_MANAGER, Role.SUPER_ADMIN)
  create(@Body() dto: CreateRequisitionDto, @CurrentUser('sub') userId: number) { return this.svc.create(dto, userId); }
  @Patch(':id/manager-review') @Roles(Role.BRANCH_MANAGER, Role.SUPER_ADMIN)
  managerReview(@Param('id', ParseIntPipe) id: number, @Body() dto: ManagerReviewDto, @CurrentUser('sub') userId: number) { return this.svc.managerReview(id, dto.action, userId, dto); }
  @Patch(':id/procurement-update') @Roles(Role.PROCUREMENT, Role.WAREHOUSE, Role.SUPER_ADMIN)
  procurementUpdate(@Param('id', ParseIntPipe) id: number, @Body() dto: ProcurementUpdateDto, @CurrentUser('sub') userId: number) { return this.svc.procurementUpdate(id, dto.status, userId, dto); }
  @Patch(':id/confirm-receipt') @Roles(Role.KITCHEN, Role.BARISTA, Role.PASTRY, Role.CASHIER, Role.CLEANER, Role.BRANCH_MANAGER, Role.SUPER_ADMIN)
  confirmReceipt(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @CurrentUser() user: any) { return this.svc.confirmReceipt(id, user.sub, user.branchId, dto.receivedItems); }
}
