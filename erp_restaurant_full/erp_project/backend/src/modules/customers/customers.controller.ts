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
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { IsQatarPhone } from '../../common/validators/qatar-phone.validator';
import { Role } from '@prisma/client';

export class CreateCustomerDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() @IsQatarPhone() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() group?: string;
  @IsOptional() @IsNumber() creditLimit?: number;
  @IsOptional() @IsString() birthday?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateCustomerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() @IsQatarPhone() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() group?: string;
  @IsOptional() @IsNumber() creditLimit?: number;
  @IsOptional() @IsString() birthday?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('Customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(private svc: CustomersService) {}

  @Get() findAll(@Query('search') search?: string) {
    return this.svc.findAll(search);
  }

  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post() @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.CASHIER)
  create(@Body() dto: CreateCustomerDto) {
    return this.svc.create(dto);
  }

  @Patch(':id') @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.CASHIER)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCustomerDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id') @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
