import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PromotionsService } from './promotions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CouponType, Role } from '@prisma/client';

export class CreateGiftCardDto {
  @IsOptional() @IsString() code?: string;
  @IsNumber() @Min(0.01) initialBalance: number;
  @IsOptional() @IsInt() customerId?: number;
  @IsOptional() @IsString() expiresAt?: string;
}
export class RedeemGiftCardDto {
  @IsNumber() @Min(0.01) amount: number;
}
export class CreateCouponDto {
  @IsOptional() @IsString() code?: string;
  @IsEnum(CouponType) type: CouponType;
  @IsNumber() @Min(0.01) value: number;
  @IsOptional() @IsNumber() minOrder?: number;
  @IsOptional() @IsInt() maxRedemptions?: number;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() endsAt?: string;
}

const MANAGE: Role[] = [Role.SUPER_ADMIN, Role.BRANCH_MANAGER];
const POS: Role[] = [Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.CASHIER];

@ApiTags('Promotions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('promotions')
export class PromotionsController {
  constructor(private svc: PromotionsService) {}

  // Gift cards
  @Get('gift-cards') @Roles(...POS)
  listGiftCards() {
    return this.svc.listGiftCards();
  }

  @Post('gift-cards') @Roles(...MANAGE)
  createGiftCard(@Body() dto: CreateGiftCardDto) {
    return this.svc.createGiftCard(dto);
  }

  @Get('gift-cards/:code') @Roles(...POS)
  getGiftCard(@Param('code') code: string) {
    return this.svc.getGiftCard(code);
  }

  @Post('gift-cards/:code/redeem') @Roles(...POS)
  redeemGiftCard(@Param('code') code: string, @Body() dto: RedeemGiftCardDto) {
    return this.svc.redeemGiftCard(code, dto.amount);
  }

  // Coupons
  @Get('coupons') @Roles(...POS)
  listCoupons() {
    return this.svc.listCoupons();
  }

  @Post('coupons') @Roles(...MANAGE)
  createCoupon(@Body() dto: CreateCouponDto) {
    return this.svc.createCoupon(dto);
  }

  @Get('coupons/:code/validate') @Roles(...POS)
  validateCoupon(@Param('code') code: string, @Query('orderTotal') orderTotal: string) {
    return this.svc.validateCoupon(code, parseFloat(orderTotal || '0'));
  }

  @Post('coupons/:code/redeem') @Roles(...POS)
  redeemCoupon(@Param('code') code: string, @Body('orderTotal') orderTotal: number) {
    return this.svc.redeemCoupon(code, Number(orderTotal) || 0);
  }
}
