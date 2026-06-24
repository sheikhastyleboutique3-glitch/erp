import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { IsString, IsOptional, IsNotEmpty, IsBoolean, IsNumber, IsInt, IsEnum, Min } from 'class-validator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DeliveryPlatformsService } from './delivery-platforms.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrderChannel, Role } from '@prisma/client';

export class CreateDeliveryPlatformDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsEnum(OrderChannel) channel?: OrderChannel;
  @IsOptional() @IsNumber() @Min(0) commissionPct?: number;
  @IsOptional() @IsInt() @Min(0) payoutTermDays?: number;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateDeliveryPlatformDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(OrderChannel) channel?: OrderChannel;
  @IsOptional() @IsNumber() @Min(0) commissionPct?: number;
  @IsOptional() @IsInt() @Min(0) payoutTermDays?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() notes?: string;
}

@ApiTags('Delivery Platforms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('delivery-platforms')
export class DeliveryPlatformsController {
  constructor(private svc: DeliveryPlatformsService) {}

  @Get() findAll() {
    return this.svc.findAll();
  }

  @Get('reconciliation') @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.PROCUREMENT)
  reconciliation(
    @Query('branchId') branchId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.reconciliation({
      branchId: branchId ? parseInt(branchId, 10) : undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Post() @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  create(@Body() dto: CreateDeliveryPlatformDto) {
    return this.svc.create(dto);
  }

  @Patch(':id') @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDeliveryPlatformDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id') @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
