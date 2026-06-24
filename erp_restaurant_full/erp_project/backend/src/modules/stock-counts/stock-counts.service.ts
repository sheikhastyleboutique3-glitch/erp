import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class StockCountsService {
  constructor(private prisma: PrismaService) {}

  private async genNo(branchId: number) {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.prisma.stockCount.count();
    return `SC-${stamp}-B${branchId}-${String(count + 1).padStart(4, '0')}`;
  }

  list(branchId?: number) {
    return this.prisma.stockCount.findMany({
      where: branchId ? { branchId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Attach product name/sku to a count's items for display. */
  private async hydrate(count: any) {
    const ids = count.items.map((i: any) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, nameAr: true, sku: true, unit: { select: { abbreviation: true } } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return { ...count, items: count.items.map((i: any) => ({ ...i, product: byId.get(i.productId) ?? null })) };
  }

  async get(id: number) {
    const count = await this.prisma.stockCount.findUnique({ where: { id }, include: { items: { orderBy: { id: 'asc' } } } });
    if (!count) throw new NotFoundException(`Stock count ${id} not found`);
    return this.hydrate(count);
  }

  /** Open a new count: snapshot current on-hand per product at the branch. */
  async create(branchId: number, userId?: number) {
    const rows = await this.prisma.inventory.findMany({
      where: { branchId },
      include: { product: { select: { id: true, costPrice: true } } },
    });
    // Collapse to one line per product (sum batch rows).
    const byProduct = new Map<number, { systemQty: number; unitCost: number }>();
    for (const r of rows) {
      const g = byProduct.get(r.productId) ?? { systemQty: 0, unitCost: r.product?.costPrice ?? 0 };
      g.systemQty += r.quantity;
      byProduct.set(r.productId, g);
    }
    if (!byProduct.size) throw new BadRequestException('No inventory at this branch to count.');

    const created = await this.prisma.stockCount.create({
      data: {
        countNo: await this.genNo(branchId),
        branchId,
        createdById: userId ?? null,
        items: {
          create: [...byProduct.entries()].map(([productId, g]) => ({
            productId,
            systemQty: g.systemQty,
            countedQty: g.systemQty,
            variance: 0,
            unitCost: g.unitCost,
            varianceValue: 0,
          })),
        },
      },
      include: { items: { orderBy: { id: 'asc' } } },
    });
    return this.hydrate(created);
  }

  /** Save counted quantities and recompute variances + total shrinkage value. */
  async updateCounts(id: number, items: { id: number; countedQty: number }[]) {
    const count = await this.prisma.stockCount.findUnique({ where: { id }, include: { items: true } });
    if (!count) throw new NotFoundException(`Stock count ${id} not found`);
    if (count.status !== 'DRAFT') throw new BadRequestException('Only DRAFT counts can be edited.');

    const patch = new Map(items.map((i) => [i.id, i.countedQty]));
    let totalVarianceValue = 0;
    await this.prisma.$transaction(
      count.items.map((it) => {
        const counted = patch.has(it.id) ? Number(patch.get(it.id)) : it.countedQty;
        const variance = +(counted - it.systemQty).toFixed(4);
        const varianceValue = +(variance * it.unitCost).toFixed(2);
        totalVarianceValue += varianceValue;
        return this.prisma.stockCountItem.update({
          where: { id: it.id },
          data: { countedQty: counted, variance, varianceValue },
        });
      }),
    );
    await this.prisma.stockCount.update({ where: { id }, data: { totalVarianceValue: +totalVarianceValue.toFixed(2) } });
    return this.get(id);
  }

  async finalize(id: number) {
    const count = await this.prisma.stockCount.findUnique({ where: { id } });
    if (!count) throw new NotFoundException(`Stock count ${id} not found`);
    if (count.status !== 'DRAFT') throw new BadRequestException('Count is already finalized.');
    await this.prisma.stockCount.update({ where: { id }, data: { status: 'FINALIZED', finalizedAt: new Date() } });
    return this.get(id);
  }
}
