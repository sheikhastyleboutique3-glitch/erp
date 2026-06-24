import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PurchaseOrderStatus } from '@prisma/client';

type AgingBucket = '0-30' | '31-60' | '61-90' | '90+';
const bucketFor = (d: number): AgingBucket => (d <= 30 ? '0-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : '90+');

@Injectable()
export class PayablesService {
  constructor(private prisma: PrismaService) {}

  /** Outstanding payables = received POs not fully paid to the supplier. */
  async list(filters: { branchId?: number; supplierId?: number }) {
    const pos = await this.prisma.purchaseOrder.findMany({
      where: {
        status: { in: [PurchaseOrderStatus.PARTIALLY_RECEIVED, PurchaseOrderStatus.FULLY_RECEIVED] },
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
      },
      include: { supplier: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    const now = Date.now();
    return pos
      .filter((po) => po.paidAmount + 1e-6 < po.totalAmount)
      .map((po) => {
        const outstanding = +(po.totalAmount - po.paidAmount).toFixed(2);
        const days = Math.max(0, Math.floor((now - new Date(po.createdAt).getTime()) / 86_400_000));
        return {
          poId: po.id,
          poNumber: po.poNumber,
          supplier: po.supplier,
          currency: po.currency,
          total: po.totalAmount,
          paid: po.paidAmount,
          outstanding,
          ageDays: days,
          bucket: bucketFor(days),
          createdAt: po.createdAt,
        };
      });
  }

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

  /** Record a payment to the supplier against a PO (clamped to its total). */
  async recordPayment(poId: number, amount: number) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po) throw new NotFoundException(`Purchase order ${poId} not found`);
    if (!(amount > 0)) throw new BadRequestException('Payment amount must be positive.');
    const paidAmount = Math.min(po.totalAmount, +(po.paidAmount + amount).toFixed(2));
    return this.prisma.purchaseOrder.update({ where: { id: poId }, data: { paidAmount } });
  }
}
