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
  IsString,
  IsOptional,
  IsNotEmpty,
  IsBoolean,
  IsNumber,
  IsInt,
  IsEnum,
  Min,
} from 'class-validator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DiscountRulesService } from './discount-rules.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { DiscountScope, DiscountType, Role } from '@prisma/client';

export class CreateDiscountRuleDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsEnum(DiscountScope) scope?: DiscountScope;
  @IsOptional() @IsEnum(DiscountType) type?: DiscountType;
  @IsOptional() @IsNumber() @Min(0) value?: number;
  @IsOptional() @IsInt() categoryId?: number;
  @IsOptional() @IsInt() productId?: number;
  @IsOptional() @IsNumber() @Min(0) minOrder?: number;
  @IsOptional() @IsBoolean() requiresManagerApproval?: boolean;
  @IsOptional() @IsString() validFrom?: string;
  @IsOptional() @IsString() validTo?: string;
}

export class UpdateDiscountRuleDto extends CreateDiscountRuleDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('Discount Rules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('discount-rules')
export class DiscountRulesController {
  constructor(private svc: DiscountRulesService) {}

  @Get() findAll(@Query('activeOnly') activeOnly?: string) {
    return this.svc.findAll(activeOnly === 'true');
  }

  @Post() @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  create(@Body() dto: CreateDiscountRuleDto) {
    return this.svc.create(dto);
  }

  @Patch(':id') @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDiscountRuleDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id') @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
