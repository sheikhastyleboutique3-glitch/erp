import {
  Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  ArrayMaxSize, IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsPositive,
  IsString, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InventoryTxType, Role } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BranchIsolationGuard } from '../../common/guards/branch-isolation.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

export class AdjustInventoryBodyDto {
  @IsInt() @IsPositive() @Type(() => Number) productId: number;
  @IsInt() @IsPositive() @Type(() => Number) branchId: number;
  @IsNumber() @Min(0) @Type(() => Number) quantity: number;
  @IsEnum(InventoryTxType) type: InventoryTxType;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() manufactureDate?: string;
  @IsOptional() @IsString() expiryDate?: string;
  @IsOptional() @IsString() batchNumber?: string;
  // Optional explicit batch target. When omitted, the service auto-routes:
  // deductions consume oldest-expiry batches (FEFO); expiry-tracked receipts
  // create/append the matching batch. Manual batch picking is never required.
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) batchId?: number;
}

export class OpeningStockRowDto {
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) productId?: number;
  @IsOptional() @IsString() branch?: string;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) branchId?: number;
  @IsNumber() @Type(() => Number) quantity: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) unitCost?: number;
  @IsOptional() @IsString() batchNumber?: string;
  @IsOptional() @IsString() manufactureDate?: string;
  @IsOptional() @IsString() expiryDate?: string;
  @IsOptional() @IsString() notes?: string;
}

export class BulkOpeningStockBodyDto {
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => OpeningStockRowDto)
  rows: OpeningStockRowDto[];
}

export class InventoryQueryDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) branchId?: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) productId?: number;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) days?: number;
}

@ApiTags('Inventory')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, BranchIsolationGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private svc: InventoryService) {}

  @Get() @ApiOperation({ summary: 'List inventory levels' })
  findAll(
    @Query() q: InventoryQueryDto,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.svc.findAll(q.branchId, q.productId, {
      search,
      categoryId: categoryId ? +categoryId : undefined,
      supplierId: supplierId ? +supplierId : undefined,
    });
  }

  @Get('grouped') @ApiOperation({ summary: 'Inventory grouped to one row per product+branch (with batch breakdown)' })
  findAllGrouped(
    @Query() q: InventoryQueryDto,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.svc.findAllGrouped(q.branchId, {
      search,
      categoryId: categoryId ? +categoryId : undefined,
      supplierId: supplierId ? +supplierId : undefined,
    });
  }

  @Get('expiry-alerts') @ApiOperation({ summary: 'Items expiring within N days' })
  expiryAlerts(@Query() q: InventoryQueryDto) { return this.svc.getExpiryAlerts(q.branchId, q.days ?? 7); }

  @Get('low-stock') @ApiOperation({ summary: 'Items below minimum stock level' })
  lowStock(@Query() q: InventoryQueryDto) { return this.svc.getLowStockAlerts(q.branchId); }

  @Get('transactions') @ApiOperation({ summary: 'Inventory transaction log' })
  transactions(@Query() q: InventoryQueryDto) { return this.svc.getTransactions(q.branchId, q.productId); }

  @Get('products/:productId/branches/:branchId/available-batches')
  @ApiOperation({ summary: 'Active batches with on-hand qty at a branch (FEFO order)' })
  availableBatches(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('branchId', ParseIntPipe) branchId: number,
  ) {
    return this.svc.getAvailableBatches(productId, branchId);
  }

  @Post('adjust') @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.PROCUREMENT, Role.WAREHOUSE)
  @ApiOperation({ summary: 'Manually adjust inventory (atomic)' })
  adjust(@Body() dto: AdjustInventoryBodyDto, @CurrentUser('sub') userId: number) {
    return this.svc.adjust({ ...dto, performedById: userId });
  }

  @Post('bulk-import') @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.PROCUREMENT, Role.WAREHOUSE)
  @ApiOperation({ summary: 'Bulk-load opening stock from CSV rows (one RECEIPT per row)' })
  bulkImport(@Body() body: BulkOpeningStockBodyDto, @CurrentUser() user: any) {
    return this.svc.bulkOpeningStock(body.rows, {
      id: user?.sub,
      role: user?.role,
      branchIds: user?.branchIds || [],
    });
  }
}
