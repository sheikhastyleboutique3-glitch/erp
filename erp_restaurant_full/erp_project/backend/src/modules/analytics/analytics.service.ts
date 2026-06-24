import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrderStatus, Prisma } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  private range(period?: string, from?: string, to?: string) {
    const now = new Date();
    let gte: Date | undefined;
    if (from) gte = new Date(from);
    else if (period === 'today') gte = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (period === 'week') gte = new Date(now.getTime() - 7 * 864e5);
    else if (period === 'month') gte = new Date(now.getFullYear(), now.getMonth(), 1);
    const lte = to ? new Date(to + 'T23:59:59.999Z') : undefined;
    return { gte, lte };
  }

  /** Headline sales metrics for the executive dashboard. */
  async salesSummary(opts: { branchId?: number; period?: string; from?: string; to?: string }) {
    const { gte, lte } = this.range(opts.period, opts.from, opts.to);
    const where: Prisma.OrderWhereInput = {
      status: OrderStatus.COMPLETED,
      ...(opts.branchId ? { branchId: opts.branchId } : {}),
      ...(gte || lte ? { completedAt: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } } : {}),
    };

    const agg = await this.prisma.order.aggregate({
      where,
      _count: { _all: true },
      _sum: { total: true, foodCost: true, grossProfit: true, discountTotal: true, taxTotal: true },
      _avg: { total: true },
    });

    const revenue = agg._sum.total ?? 0;
    const foodCost = agg._sum.foodCost ?? 0;

    // Payment method mix (only payments on matching orders).
    const payMix = await this.prisma.payment.groupBy({
      by: ['method'],
      where: { order: where },
      _sum: { amount: true },
      _count: { _all: true },
    });

    return {
      orders: agg._count._all,
      revenue,
      foodCost,
      grossProfit: agg._sum.grossProfit ?? 0,
      foodCostPct: revenue ? (foodCost / revenue) * 100 : 0,
      avgTicket: agg._avg.total ?? 0,
      discountTotal: agg._sum.discountTotal ?? 0,
      taxTotal: agg._sum.taxTotal ?? 0,
      paymentMix: payMix.map((p) => ({
        method: p.method,
        amount: p._sum.amount ?? 0,
        count: p._count._all,
      })),
    };
  }

  async bestSellers(opts: { branchId?: number; period?: string; from?: string; to?: string; limit?: number }) {
    const { gte, lte } = this.range(opts.period, opts.from, opts.to);
    const orderWhere: Prisma.OrderWhereInput = {
      status: OrderStatus.COMPLETED,
      ...(opts.branchId ? { branchId: opts.branchId } : {}),
      ...(gte || lte ? { completedAt: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } } : {}),
    };
    const grouped = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: { order: orderWhere },
      _sum: { quantity: true, lineTotal: true, lineCost: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: opts.limit ?? 10,
    });
    const products = await this.prisma.product.findMany({
      where: { id: { in: grouped.map((g) => g.productId) } },
      select: { id: true, sku: true, name: true, nameAr: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return grouped.map((g) => ({
      product: byId.get(g.productId) ?? { id: g.productId },
      quantity: g._sum.quantity ?? 0,
      revenue: g._sum.lineTotal ?? 0,
      cost: g._sum.lineCost ?? 0,
      grossProfit: (g._sum.lineTotal ?? 0) - (g._sum.lineCost ?? 0),
    }));
  }

  async topCustomers(opts: { branchId?: number; period?: string; from?: string; to?: string; limit?: number }) {
    const { gte, lte } = this.range(opts.period, opts.from, opts.to);
    const grouped = await this.prisma.order.groupBy({
      by: ['customerId'],
      where: {
        status: OrderStatus.COMPLETED,
        customerId: { not: null },
        ...(opts.branchId ? { branchId: opts.branchId } : {}),
        ...(gte || lte ? { completedAt: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } } : {}),
      },
      _sum: { total: true },
      _count: { _all: true },
      orderBy: { _sum: { total: 'desc' } },
      take: opts.limit ?? 10,
    });
    const ids = grouped.map((g) => g.customerId).filter((x): x is number => x != null);
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, phone: true, loyaltyPoints: true },
    });
    const byId = new Map(customers.map((c) => [c.id, c]));
    return grouped.map((g) => ({
      customer: g.customerId != null ? byId.get(g.customerId) ?? { id: g.customerId } : null,
      spend: g._sum.total ?? 0,
      orders: g._count._all,
    }));
  }
}
