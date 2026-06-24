import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsBoolean,
  IsInt,
  IsEnum,
} from 'class-validator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrintersService } from './printers.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ConnectionType, Role } from '@prisma/client';

export class CreatePrinterDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsEnum(ConnectionType) connection?: ConnectionType;
  @IsOptional() @IsString() ipAddress?: string;
  @IsOptional() @IsInt() port?: number;
  @IsOptional() @IsString() usbPort?: string;
  @IsOptional() @IsInt() widthMm?: number;
  @IsOptional() @IsInt() branchId?: number;
  @IsOptional() @IsString() notes?: string;
}

export class UpdatePrinterDto extends CreatePrinterDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

const POS_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.BRANCH_MANAGER,
  Role.CASHIER,
  Role.WAITER,
  Role.KITCHEN,
  Role.BARISTA,
  Role.PASTRY,
];

@ApiTags('Printers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('printers')
export class PrintersController {
  constructor(private svc: PrintersService) {}

  @Get() findAll() {
    return this.svc.findAll();
  }

  // Station-grouped KOT tickets for an order (routed by category printer/station).
  @Get('kot/:orderId') @Roles(...POS_ROLES)
  buildKot(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.svc.buildKot(orderId);
  }

  @Post() @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  create(@Body() dto: CreatePrinterDto) {
    return this.svc.create(dto);
  }

  @Patch(':id') @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePrinterDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id') @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
