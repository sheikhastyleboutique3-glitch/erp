import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsInt, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StockCountsService } from './stock-counts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

export class CountLineDto {
  @IsInt() id: number;
  @IsNumber() countedQty: number;
}
export class UpdateCountsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => CountLineDto) items: CountLineDto[];
}

const MANAGE: Role[] = [Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.WAREHOUSE];

@ApiTags('Stock Counts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stock-counts')
export class StockCountsController {
  constructor(private svc: StockCountsService) {}

  @Get()
  list(@Query('branchId') branchId?: string) {
    return this.svc.list(branchId ? parseInt(branchId, 10) : undefined);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.get(id);
  }

  @Post() @Roles(...MANAGE)
  create(@Query('branchId', ParseIntPipe) branchId: number, @CurrentUser('id') userId: number) {
    return this.svc.create(branchId, userId);
  }

  @Patch(':id') @Roles(...MANAGE)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCountsDto) {
    return this.svc.updateCounts(id, dto.items);
  }

  @Post(':id/finalize') @Roles(...MANAGE)
  finalize(@Param('id', ParseIntPipe) id: number) {
    return this.svc.finalize(id);
  }
}
