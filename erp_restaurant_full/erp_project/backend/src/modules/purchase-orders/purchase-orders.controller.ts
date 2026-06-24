import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { IsInt, IsPositive, IsOptional, IsString, IsNumber, IsArray, ValidateNested, IsDateString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PurchaseOrdersService } from './purchase-orders.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role, PurchaseOrderStatus } from '@prisma/client';

class CreatePOItemDto {
  @IsInt() @IsPositive() @Type(() => Number) productId: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) unitId?: number;
  @IsNumber() @Min(0.01) @Type(() => Number) orderedQty: number;
  @IsNumber() @Min(0) @Type(() => Number) unitPrice: number;
  @IsOptional() @IsDateString() expiryDate?: string;
}

export class CreatePurchaseOrderDto {
  @IsInt() @IsPositive() @Type(() => Number) supplierId: number;
  @IsInt() @IsPositive() @Type(() => Number) branchId: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) requisitionId?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() expectedDate?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreatePOItemDto) items: CreatePOItemDto[];
}

class UpdatePOItemDto {
  @IsInt() @IsPositive() @Type(() => Number) productId: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) unitId?: number;
  @IsNumber() @Min(0.01) @Type(() => Number) orderedQty: number;
  @IsNumber() @Min(0) @Type(() => Number) unitPrice: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) receivedQty?: number;
  @IsOptional() @IsDateString() expiryDate?: string;
}

export class UpdatePurchaseOrderDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) supplierId?: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) branchId?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() expectedDate?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => UpdatePOItemDto) items?: UpdatePOItemDto[];
}

class ReceivePOItemDto {
  @IsInt() @IsPositive() @Type(() => Number) itemId: number;
  @IsNumber() @Min(0) @Type(() => Number) receivedQty: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) unitPrice?: number;
  // GRN-stage batch capture (per requirement #4). The service uses these to
  // build the Batch / resolve expiry; they must be whitelisted or the global
  // ValidationPipe (forbidNonWhitelisted) rejects the request with a 400.
  @IsOptional() @IsDateString() dateReceived?: string;
  @IsOptional() @IsDateString() manufactureDate?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
}

export class ReceivePurchaseOrderDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReceivePOItemDto) items: ReceivePOItemDto[];
  @IsOptional() updateCostPrice?: boolean;
  @IsOptional() @IsString() notes?: string;
}

@ApiTags('Purchase Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private svc: PurchaseOrdersService) {}

  @Get()
  findAll(
    @Query('branchId') branchId?: string,
    @Query('status') status?: PurchaseOrderStatus,
    @Query('supplierId') supplierId?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.findAll({
      branchId: branchId ? +branchId : undefined,
      status,
      supplierId: supplierId ? +supplierId : undefined,
      search,
      from,
      to,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post() @Roles(Role.SUPER_ADMIN, Role.PROCUREMENT)
  create(@Body() dto: CreatePurchaseOrderDto, @CurrentUser('sub') userId: number) {
    return this.svc.create(dto, userId);
  }

  @Patch(':id/status') @Roles(Role.SUPER_ADMIN, Role.PROCUREMENT, Role.WAREHOUSE)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: PurchaseOrderStatus },
    @CurrentUser('sub') userId: number,
  ) {
    return this.svc.updateStatus(id, body.status, userId);
  }

  @Patch(':id') @Roles(Role.SUPER_ADMIN, Role.PROCUREMENT, Role.WAREHOUSE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseOrderDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.svc.update(id, dto, userId);
  }

  @Patch(':id/receive') @Roles(Role.SUPER_ADMIN, Role.PROCUREMENT, Role.WAREHOUSE)
  receive(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReceivePurchaseOrderDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.svc.receive(id, dto, userId);
  }
}
