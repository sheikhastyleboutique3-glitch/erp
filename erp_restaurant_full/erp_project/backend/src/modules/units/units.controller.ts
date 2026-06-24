import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { IsString, IsOptional, IsNotEmpty, IsBoolean } from 'class-validator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UnitsService } from './units.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

export class CreateUnitDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsString() @IsNotEmpty() abbreviation: string;
}

export class UpdateUnitDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() abbreviation?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('Units')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('units')
export class UnitsController {
  constructor(private svc: UnitsService) {}

  @Get() findAll() { return this.svc.findAll(); }

  @Post() @Roles(Role.SUPER_ADMIN)
  create(@Body() dto: CreateUnitDto) { return this.svc.create(dto); }

  @Patch(':id') @Roles(Role.SUPER_ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUnitDto) { return this.svc.update(id, dto); }

  @Delete(':id') @Roles(Role.SUPER_ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
}
