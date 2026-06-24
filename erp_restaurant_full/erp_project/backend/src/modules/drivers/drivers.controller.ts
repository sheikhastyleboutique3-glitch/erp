import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DriversService } from './drivers.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

class DriverDto {
  @IsString() name: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() licenseNo?: string;
  @IsOptional() @IsString() vehicle?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('Drivers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('drivers')
export class DriversController {
  constructor(private svc: DriversService) {}

  // Any authenticated user may list drivers (needed for the dispatch picker).
  @Get() findAll(@Query('active') active?: string) {
    return this.svc.findAll(active === 'true');
  }

  @Post() @Roles(Role.SUPER_ADMIN)
  create(@Body() dto: DriverDto) {
    return this.svc.create(dto);
  }

  @Patch(':id') @Roles(Role.SUPER_ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: DriverDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id') @Roles(Role.SUPER_ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
