import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { IsInt, IsPositive, IsNumber, IsEnum, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { WastageService } from './wastage.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WastageReason } from '@prisma/client';

export class CreateWastageDto {
  @IsInt() @IsPositive() @Type(() => Number) branchId: number;
  @IsInt() @IsPositive() @Type(() => Number) productId: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) unitId?: number;
  @IsNumber() @Min(0.01) @Type(() => Number) quantity: number;
  @IsEnum(WastageReason) reason: WastageReason;
  @IsOptional() @IsString() notes?: string;
}

@ApiTags('Wastage')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wastage')
export class WastageController {
  constructor(private svc: WastageService) {}

  @Get() findAll(
    @Query('branchId') branchId?: string,
    @Query('search') search?: string,
    @Query('reason') reason?: string,
    @Query('productId') productId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.findAll(branchId ? +branchId : undefined, {
      search, reason, productId: productId ? +productId : undefined, from, to,
    });
  }

  @Get('stats') getStats(@Query('branchId') branchId?: string) { return this.svc.getStats(branchId ? +branchId : undefined); }

  @Post() create(@Body() dto: CreateWastageDto, @CurrentUser('sub') userId: number) { return this.svc.create(dto, userId); }
}
