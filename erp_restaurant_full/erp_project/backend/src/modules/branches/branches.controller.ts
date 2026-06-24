import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { IsString, IsOptional, IsNotEmpty, IsBoolean, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BranchesService } from './branches.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

export class CreateBranchDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() nameAr: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsBoolean() isWarehouse?: boolean;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) cashFloat?: number;
}

export class UpdateBranchDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isWarehouse?: boolean;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) cashFloat?: number;
}

@ApiTags('Branches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('branches')
export class BranchesController {
  constructor(private svc: BranchesService) {}

  @Get() findAll() { return this.svc.findAll(); }

  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post() @Roles(Role.SUPER_ADMIN)
  create(@Body() dto: CreateBranchDto) { return this.svc.create(dto); }

  @Patch(':id') @Roles(Role.SUPER_ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBranchDto) { return this.svc.update(id, dto); }

  @Delete(':id') @Roles(Role.SUPER_ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
}
