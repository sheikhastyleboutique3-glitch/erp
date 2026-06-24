import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

export type AgingBucket = '0-30' | '31-60' | '61-90' | '90+';

function bucketFor(days: number): AgingBucket {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

@Injectable()
export class ReceivablesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Outstanding receivables = COMPLETED orders that have a customer and are not
   * fully paid (e.g. on-account catering sales orders). Each carries its
   * outstanding balance and ageing in days.
   */
  async list(filters: { branchId?: number; customerId?: number }) {
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.COMPLETED,
        customerId: { not: null },
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(filters.customerId ? { customerId: filters.customerId } : {}),
      },
      include: { customer: { select: { id: true, name: true, phone: true } }, payments: true },
      orderBy: { completedAt: 'asc' },
      take: 500,
    });
    const now = Date.now();
    return orders
      .filter((o) => o.paidTotal + 1e-6 < o.total)
      .map((o) => {
        const outstanding = +(o.total - o.paidTotal).toFixed(2);
        const ref = o.completedAt ?? o.createdAt;
        const days = Math.max(0, Math.floor((now - new Date(ref).getTime()) / 86_400_000));
        return {
          orderId: o.id,
          orderNo: o.orderNo,
          customer: o.customer,
          total: o.total,
          paid: o.paidTotal,
          outstanding,
          ageDays: days,
          bucket: bucketFor(days),
          completedAt: o.completedAt,
        };
      });
  }

  /** Aging summary: outstanding totals bucketed by age. */
  async aging(branchId?: number) {
    const rows = await this.list({ branchId });
    const buckets: Record<AgingBucket, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    let total = 0;
    for (const r of rows) {
      buckets[r.bucket] = +(buckets[r.bucket] + r.outstanding).toFixed(2);
      total = +(total + r.outstanding).toFixed(2);
    }
    return { buckets, total, count: rows.length };
  }
}
