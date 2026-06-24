import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrderChannel, OrderStatus } from '@prisma/client';

@Injectable()
export class DeliveryPlatformsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.deliveryPlatform.findMany({ orderBy: { name: 'asc' } });
  }

  create(dto: any) {
    return this.prisma.deliveryPlatform.create({ data: dto });
  }

  update(id: number, dto: any) {
    return this.prisma.deliveryPlatform.update({ where: { id }, data: dto });
  }

  remove(id: number) {
    return this.prisma.deliveryPlatform.update({ where: { id }, data: { isActive: false } });
  }

  /**
   * Reconciliation summary: for completed aggregator orders, how much gross was
   * sold per platform, how much commission the platform keeps, and the expected
   * net payout to the restaurant. This is what keeps the cash drawer honest —
   * aggregator money never sat in the till, it's owed by the platform.
   */
  async reconciliation(filters: { branchId?: number; from?: Date; to?: Date }) {
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.COMPLETED,
        channel: { in: [OrderChannel.TALABAT, OrderChannel.SNOONU, OrderChannel.AGGREGATOR] },
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(filters.from || filters.to
          ? { completedAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
          : {}),
      },
      select: {
        deliveryPlatformId: true,
        channel: true,
        total: true,
        commissionAmount: true,
        netPayout: true,
      },
    });

    const platforms = await this.prisma.deliveryPlatform.findMany();
    const nameById = new Map(platforms.map((p) => [p.id, p.name]));

    const buckets: Record<string, { key: string; orders: number; gross: number; commission: number; netPayout: number }> = {};
    for (const o of orders) {
      const key = o.deliveryPlatformId ? nameById.get(o.deliveryPlatformId) ?? `#${o.deliveryPlatformId}` : o.channel;
      const b = (buckets[key] ??= { key, orders: 0, gross: 0, commission: 0, netPayout: 0 });
      b.orders += 1;
      b.gross += o.total;
      b.commission += o.commissionAmount;
      b.netPayout += o.netPayout;
    }

    const rows = Object.values(buckets).map((b) => ({
      ...b,
      gross: Math.round(b.gross * 100) / 100,
      commission: Math.round(b.commission * 100) / 100,
      netPayout: Math.round(b.netPayout * 100) / 100,
    }));

    const totals = rows.reduce(
      (acc, r) => ({
        orders: acc.orders + r.orders,
        gross: Math.round((acc.gross + r.gross) * 100) / 100,
        commission: Math.round((acc.commission + r.commission) * 100) / 100,
        netPayout: Math.round((acc.netPayout + r.netPayout) * 100) / 100,
      }),
      { orders: 0, gross: 0, commission: 0, netPayout: 0 },
    );

    return { rows, totals };
  }
}
