import { Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

export class CreateSupplierDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxNumber?: string;
  @IsOptional() @IsString() paymentTerms?: string;
}

export class UpdateSupplierDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxNumber?: string;
  @IsOptional() @IsString() paymentTerms?: string;
}

@ApiTags('Suppliers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private svc: SuppliersService) {}

  @Get() findAll() { return this.svc.findAll(); }

  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Get(':id/price-history')
  getPriceHistory(
    @Param('id', ParseIntPipe) id: number,
    @Query('productId') productId?: string,
  ) {
    return this.svc.getPriceHistory(id, productId ? parseInt(productId, 10) : undefined);
  }

  @Post() @Roles(Role.SUPER_ADMIN, Role.PROCUREMENT)
  create(@Body() dto: CreateSupplierDto) { return this.svc.create(dto); }

  @Patch(':id') @Roles(Role.SUPER_ADMIN, Role.PROCUREMENT)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSupplierDto) { return this.svc.update(id, dto); }

  @Delete(':id') @Roles(Role.SUPER_ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
}
