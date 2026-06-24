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
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TablesService } from './tables.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReservationStatus, Role, TableStatus } from '@prisma/client';

export class CreateTableDto {
  @IsInt() branchId: number;
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsInt() seats?: number;
}
export class UpdateTableDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() seats?: number;
  @IsOptional() @IsEnum(TableStatus) status?: TableStatus;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class CreateReservationDto {
  @IsInt() branchId: number;
  @IsString() reservedAt: string;
  @IsOptional() @IsInt() tableId?: number;
  @IsOptional() @IsInt() customerId?: number;
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsInt() partySize?: number;
  @IsOptional() @IsString() notes?: string;
}
export class SetReservationStatusDto {
  @IsEnum(ReservationStatus) status: ReservationStatus;
}

const MANAGE: Role[] = [Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.CASHIER, Role.WAITER];

@ApiTags('Tables & Reservations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class TablesController {
  constructor(private svc: TablesService) {}

  @Get('tables')
  listTables(@Query('branchId') branchId?: string) {
    return this.svc.listTables(branchId ? parseInt(branchId, 10) : undefined);
  }

  @Post('tables') @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  createTable(@Body() dto: CreateTableDto) {
    return this.svc.createTable(dto);
  }

  @Patch('tables/:id') @Roles(...MANAGE)
  updateTable(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTableDto) {
    return this.svc.updateTable(id, dto);
  }

  @Delete('tables/:id') @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  removeTable(@Param('id', ParseIntPipe) id: number) {
    return this.svc.removeTable(id);
  }

  @Get('reservations')
  listReservations(
    @Query('branchId') branchId?: string,
    @Query('status') status?: ReservationStatus,
    @Query('date') date?: string,
  ) {
    return this.svc.listReservations({
      branchId: branchId ? parseInt(branchId, 10) : undefined,
      status,
      date,
    });
  }

  @Post('reservations') @Roles(...MANAGE)
  createReservation(@Body() dto: CreateReservationDto, @CurrentUser('id') userId: number) {
    return this.svc.createReservation(dto, userId);
  }

  @Patch('reservations/:id/status') @Roles(...MANAGE)
  setStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: SetReservationStatusDto) {
    return this.svc.setReservationStatus(id, dto.status);
  }
}
