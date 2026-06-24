import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class PricingService {
  constructor(private prisma: PrismaService) {}

  async bulkUpdate(dto: {
    type: 'percentage' | 'fixed';
    value: number;
    scope: { categoryId?: number; supplierId?: number; productIds?: number[] };
  }, userId?: number) {
    const where: any = { isActive: true, isArchived: false };
    if (dto.scope.categoryId) where.categoryId = dto.scope.categoryId;
    if (dto.scope.supplierId) where.supplierId = dto.scope.supplierId;
    if (dto.scope.productIds?.length) where.id = { in: dto.scope.productIds };

    const products = await this.prisma.product.findMany({ where });
    let updated = 0;
    const affectedProductIds: number[] = [];

    for (const p of products) {
      let newPrice: number;
      if (dto.type === 'percentage') {
        newPrice = p.costPrice * (1 + dto.value / 100);
      } else {
        newPrice = p.costPrice + dto.value;
      }
      newPrice = Math.max(0, Math.round(newPrice * 100) / 100);

      // Record price change in supplier price history
      if (p.supplierId && p.costPrice !== newPrice) {
        await this.prisma.supplierPriceHistory.create({
          data: {
            supplierId: p.supplierId,
            productId: p.id,
            oldPrice: p.costPrice,
            newPrice,
            changedById: userId ?? null,
            source: 'BULK_PRICING',
            notes: `Bulk ${dto.type} update: ${dto.value}${dto.type === 'percentage' ? '%' : ' fixed'}`,
          },
        });
      }

      await this.prisma.product.update({
        where: { id: p.id },
        data: { costPrice: newPrice },
      });
      affectedProductIds.push(p.id);
      updated++;
    }

    // Phase 4: Cascade to open/unfulfilled requisitions
    // Update unit prices on any DRAFT or SUBMITTED requisition items
    // that reference the affected products
    let requisitionItemsUpdated = 0;
    if (affectedProductIds.length > 0) {
      const openReqItems = await this.prisma.requisitionItem.findMany({
        where: {
          productId: { in: affectedProductIds },
          requisition: {
            status: { in: ['DRAFT', 'SUBMITTED'] },
          },
        },
        include: { product: true },
      });

      for (const item of openReqItems) {
        // Refresh the product to get the updated costPrice
        const freshProduct = await this.prisma.product.findUnique({
          where: { id: item.productId },
        });
        if (freshProduct) {
          // Store a notes annotation about the price change
          const priceNote = `Cost updated: ${item.product.costPrice} -> ${freshProduct.costPrice}`;
          await this.prisma.requisitionItem.update({
            where: { id: item.id },
            data: {
              notes: item.notes
                ? `${item.notes} | ${priceNote}`
                : priceNote,
            },
          });
          requisitionItemsUpdated++;
        }
      }
    }

    // Phase 4: Cascade to open purchase order items
    let poItemsUpdated = 0;
    if (affectedProductIds.length > 0) {
      const openPoItems = await this.prisma.purchaseOrderItem.findMany({
        where: {
          productId: { in: affectedProductIds },
          purchaseOrder: {
            status: { in: ['DRAFT', 'SENT_TO_SUPPLIER'] },
          },
        },
      });

      for (const item of openPoItems) {
        const freshProduct = await this.prisma.product.findUnique({
          where: { id: item.productId },
        });
        if (freshProduct) {
          await this.prisma.purchaseOrderItem.update({
            where: { id: item.id },
            data: { unitPrice: freshProduct.costPrice },
          });
          poItemsUpdated++;
        }
      }

      // Recalculate PO totals
      const affectedPOs = await this.prisma.purchaseOrder.findMany({
        where: {
          status: { in: ['DRAFT', 'SENT_TO_SUPPLIER'] },
          items: { some: { productId: { in: affectedProductIds } } },
        },
        include: { items: true },
      });
      for (const po of affectedPOs) {
        const total = po.items.reduce((s, i) => s + i.orderedQty * i.unitPrice, 0);
        await this.prisma.purchaseOrder.update({
          where: { id: po.id },
          data: { totalAmount: Math.round(total * 100) / 100 },
        });
      }
    }

    return {
      updated,
      total: products.length,
      type: dto.type,
      value: dto.value,
      cascaded: {
        requisitionItems: requisitionItemsUpdated,
        purchaseOrderItems: poItemsUpdated,
      },
    };
  }
}
