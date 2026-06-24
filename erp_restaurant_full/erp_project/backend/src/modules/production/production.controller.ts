import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProductionService } from './production.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProductionOrderStatus, Role } from '@prisma/client';

export class CreateProductionDto {
  @IsInt() branchId: number;
  @IsInt() productId: number;
  @IsOptional() @IsInt() recipeId?: number;
  @IsNumber() @Min(0.0001) plannedQty: number;
  @IsOptional() @IsString() batchNumber?: string;
  @IsOptional() @IsString() expiryDate?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CompleteProductionDto {
  @IsOptional() @IsNumber() @Min(0.0001) producedQty?: number;
}

const PROD_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.BRANCH_MANAGER,
  Role.KITCHEN,
  Role.PASTRY,
  Role.WAREHOUSE,
];

@ApiTags('Production')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('production')
export class ProductionController {
  constructor(private svc: ProductionService) {}

  @Get()
  findAll(@Query('branchId') branchId?: string, @Query('status') status?: ProductionOrderStatus) {
    return this.svc.findAll({
      branchId: branchId ? parseInt(branchId, 10) : undefined,
      status,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post() @Roles(...PROD_ROLES)
  create(@Body() dto: CreateProductionDto, @CurrentUser('id') userId: number) {
    return this.svc.create(dto, userId);
  }

  @Patch(':id/start') @Roles(...PROD_ROLES)
  start(@Param('id', ParseIntPipe) id: number) {
    return this.svc.start(id);
  }

  @Patch(':id/cancel') @Roles(...PROD_ROLES)
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.svc.cancel(id);
  }

  @Post(':id/complete') @Roles(...PROD_ROLES)
  complete(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteProductionDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.svc.complete(id, dto?.producedQty, userId);
  }
}
