import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SalesQuotesService } from './sales-quotes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role, SalesQuoteStatus } from '@prisma/client';

export class QuoteItemDto {
  @IsInt() productId: number;
  @IsNumber() @Min(0.0001) quantity: number;
  @IsNumber() @Min(0) unitPrice: number;
}
export class CreateQuoteDto {
  @IsInt() branchId: number;
  @IsOptional() @IsInt() customerId?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() validUntil?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => QuoteItemDto) items: QuoteItemDto[];
}
export class UpdateQuoteDto {
  @IsOptional() @IsInt() customerId?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() validUntil?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => QuoteItemDto) items?: QuoteItemDto[];
}

const MANAGE: Role[] = [Role.SUPER_ADMIN, Role.BRANCH_MANAGER];

@ApiTags('Sales Quotes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sales-quotes')
export class SalesQuotesController {
  constructor(private svc: SalesQuotesService) {}

  @Get()
  list(@Query('branchId') branchId?: string, @Query('status') status?: SalesQuoteStatus) {
    return this.svc.list({ branchId: branchId ? parseInt(branchId, 10) : undefined, status });
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.get(id);
  }

  @Post() @Roles(...MANAGE)
  create(@Body() dto: CreateQuoteDto, @CurrentUser('id') userId: number) {
    return this.svc.create(dto, userId);
  }

  @Patch(':id') @Roles(...MANAGE)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateQuoteDto) {
    return this.svc.update(id, dto);
  }

  @Post(':id/confirm') @Roles(...MANAGE)
  confirm(@Param('id', ParseIntPipe) id: number) {
    return this.svc.confirm(id);
  }

  @Post(':id/cancel') @Roles(...MANAGE)
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.svc.cancel(id);
  }

  @Post(':id/fulfill') @Roles(...MANAGE)
  fulfill(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.svc.fulfill(id, userId);
  }
}
