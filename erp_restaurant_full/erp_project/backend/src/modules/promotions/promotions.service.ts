import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CouponType } from '@prisma/client';

@Injectable()
export class PromotionsService {
  constructor(private prisma: PrismaService) {}

  private randomCode(prefix: string) {
    return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  // ---- Gift cards ----
  listGiftCards() {
    return this.prisma.giftCard.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  createGiftCard(dto: { code?: string; initialBalance: number; customerId?: number; expiresAt?: string }) {
    if (!(dto.initialBalance > 0)) throw new BadRequestException('initialBalance must be > 0.');
    return this.prisma.giftCard.create({
      data: {
        code: dto.code || this.randomCode('GC'),
        initialBalance: dto.initialBalance,
        balance: dto.initialBalance,
        customerId: dto.customerId ?? null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  async getGiftCard(code: string) {
    const gc = await this.prisma.giftCard.findUnique({ where: { code } });
    if (!gc) throw new NotFoundException(`Gift card ${code} not found`);
    return gc;
  }

  async redeemGiftCard(code: string, amount: number) {
    const gc = await this.getGiftCard(code);
    if (!gc.isActive) throw new BadRequestException('Gift card is inactive.');
    if (gc.expiresAt && gc.expiresAt < new Date()) throw new BadRequestException('Gift card expired.');
    if (amount <= 0) throw new BadRequestException('Redeem amount must be > 0.');
    if (gc.balance < amount) {
      throw new BadRequestException(`Insufficient gift card balance: ${gc.balance} < ${amount}.`);
    }
    const balance = gc.balance - amount;
    return this.prisma.giftCard.update({
      where: { code },
      data: { balance, isActive: balance > 0 },
    });
  }

  // ---- Coupons ----
  listCoupons() {
    return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  createCoupon(dto: {
    code?: string;
    type: CouponType;
    value: number;
    minOrder?: number;
    maxRedemptions?: number;
    startsAt?: string;
    endsAt?: string;
  }) {
    if (!(dto.value > 0)) throw new BadRequestException('value must be > 0.');
    return this.prisma.coupon.create({
      data: {
        code: dto.code || this.randomCode('CPN'),
        type: dto.type,
        value: dto.value,
        minOrder: dto.minOrder ?? 0,
        maxRedemptions: dto.maxRedemptions ?? null,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
    });
  }

  /** Validate a coupon against an order total and compute the discount it grants. */
  async validateCoupon(code: string, orderTotal: number) {
    const c = await this.prisma.coupon.findUnique({ where: { code } });
    if (!c) throw new NotFoundException(`Coupon ${code} not found`);
    const now = new Date();
    if (!c.isActive) throw new BadRequestException('Coupon is inactive.');
    if (c.startsAt && c.startsAt > now) throw new BadRequestException('Coupon not yet active.');
    if (c.endsAt && c.endsAt < now) throw new BadRequestException('Coupon expired.');
    if (c.maxRedemptions != null && c.redeemedCount >= c.maxRedemptions) {
      throw new BadRequestException('Coupon redemption limit reached.');
    }
    if (orderTotal < c.minOrder) {
      throw new BadRequestException(`Order total ${orderTotal} below minimum ${c.minOrder}.`);
    }
    const discount =
      c.type === CouponType.PERCENT
        ? Math.min(orderTotal, (orderTotal * c.value) / 100)
        : Math.min(orderTotal, c.value);
    return { code: c.code, type: c.type, value: c.value, discount };
  }

  async redeemCoupon(code: string, orderTotal: number) {
    const result = await this.validateCoupon(code, orderTotal);
    await this.prisma.coupon.update({
      where: { code },
      data: { redeemedCount: { increment: 1 } },
    });
    return result;
  }
}
