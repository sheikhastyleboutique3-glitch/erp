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
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrderChannel, OrderStatus, PaymentMethod, Role } from '@prisma/client';

export class OrderItemDto {
  @IsInt() productId: number;
  @IsNumber() @Min(0.0001) quantity: number;
  @IsNumber() @Min(0) unitPrice: number;
  @IsOptional() @IsNumber() discount?: number;
  @IsOptional() @IsNumber() taxAmount?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreateOrderDto {
  @IsInt() branchId: number;
  @IsOptional() @IsEnum(OrderChannel) channel?: OrderChannel;
  @IsOptional() @IsInt() customerId?: number;
  @IsOptional() @IsString() tableName?: string;
  @IsOptional() @IsNumber() serviceCharge?: number;
  @IsOptional() @IsNumber() tip?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() couponCode?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OrderItemDto)
  items?: OrderItemDto[];
}

export class AddPaymentDto {
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsNumber() @Min(0.0001) amount: number;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() giftCardCode?: string;
}

export class CompleteOrderDto {
  @IsOptional() allowUnpaid?: boolean;
}

const POS_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.BRANCH_MANAGER,
  Role.CASHIER,
];

@ApiTags('Sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sales/orders')
export class SalesController {
  constructor(private svc: SalesService) {}

  @Get()
  findAll(
    @Query('branchId') branchId?: string,
    @Query('status') status?: OrderStatus,
    @Query('customerId') customerId?: string,
  ) {
    return this.svc.findAll({
      branchId: branchId ? parseInt(branchId, 10) : undefined,
      status,
      customerId: customerId ? parseInt(customerId, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post() @Roles(...POS_ROLES)
  create(@Body() dto: CreateOrderDto, @CurrentUser('id') userId: number) {
    return this.svc.create(dto, userId);
  }

  @Post(':id/items') @Roles(...POS_ROLES)
  addItem(@Param('id', ParseIntPipe) id: number, @Body() dto: OrderItemDto) {
    return this.svc.addItem(id, dto);
  }

  @Delete(':id/items/:itemId') @Roles(...POS_ROLES)
  removeItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.svc.removeItem(id, itemId);
  }

  @Patch(':id/hold') @Roles(...POS_ROLES)
  hold(@Param('id', ParseIntPipe) id: number) {
    return this.svc.setStatus(id, OrderStatus.HELD);
  }

  @Patch(':id/resume') @Roles(...POS_ROLES)
  resume(@Param('id', ParseIntPipe) id: number) {
    return this.svc.setStatus(id, OrderStatus.OPEN);
  }

  @Patch(':id/void') @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  voidOrder(@Param('id', ParseIntPipe) id: number) {
    return this.svc.voidOrder(id);
  }

  @Post(':id/payments') @Roles(...POS_ROLES)
  addPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddPaymentDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.svc.addPayment(id, dto, userId);
  }

  @Post(':id/complete') @Roles(...POS_ROLES)
  complete(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteOrderDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.svc.complete(id, { allowUnpaid: !!dto?.allowUnpaid }, userId);
  }
}
