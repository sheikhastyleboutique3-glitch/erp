import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PurchaseOrderStatus, InventoryTxType, Prisma } from '@prisma/client';
import { InventoryService } from '../inventory/inventory.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface FindAllPOFilters {
  branchId?: number;
  status?: PurchaseOrderStatus;
  supplierId?: number;
  search?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Run a unit of work inside a single Serializable transaction, retrying on
   * write-conflict (P2034) so concurrent PO receipts stay consistent.
   */
  private async runSerializable<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    retries = 3,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15_000,
      });
    } catch (err: any) {
      if (err?.code === 'P2034' && retries > 0) {
        await new Promise((r) => setTimeout(r, (4 - retries) * 100));
        return this.runSerializable(fn, retries - 1);
      }
      throw err;
    }
  }

  private async generatePoNo(): Promise<string> {
    const count = await this.prisma.purchaseOrder.count();
    return `PO-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
  }

  private async generateBatchNo(tx: Prisma.TransactionClient, sku: string): Promise<string> {
    const count = await tx.batch.count();
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `B-${stamp}-${sku}-${String(count + 1).padStart(4, '0')}`;
  }

  /**
   * Resolve the expiry (and validate inputs) for a received line based on the
   * product's expiry-tracking configuration (per requirement #3 / #4).
   */
  private resolveBatchExpiry(
    product: { tracksExpiry: boolean; expiryTrackingType: any; shelfLifeDays: number | null },
    line: { dateReceived?: string; manufactureDate?: string; expiryDate?: string },
  ): { manufactureDate: Date | null; expiryDate: Date | null } | null {
    if (!product.tracksExpiry) return null;

    if (product.expiryTrackingType === 'SHELF_LIFE_DAYS') {
      if (!product.shelfLifeDays || product.shelfLifeDays <= 0) {
        throw new BadRequestException('Product tracks shelf life but shelfLifeDays is not configured');
      }
      const received = line.dateReceived ? new Date(line.dateReceived) : new Date();
      const expiry = new Date(received);
      expiry.setDate(expiry.getDate() + product.shelfLifeDays);
      return { manufactureDate: null, expiryDate: expiry };
    }

    if (product.expiryTrackingType === 'MANUFACTURE_TO_EXPIRY') {
      if (!line.expiryDate) {
        throw new BadRequestException('Expiry date is mandatory for manufacture-to-expiry items');
      }
      return {
        manufactureDate: line.manufactureDate ? new Date(line.manufactureDate) : null,
        expiryDate: new Date(line.expiryDate),
      };
    }
    return null;
  }

  findAll(filters: FindAllPOFilters = {}) {
    const where: any = {};
    if (filters.branchId) where.branchId = filters.branchId;
    if (filters.status) where.status = filters.status;
    if (filters.supplierId) where.supplierId = filters.supplierId;
    if (filters.search) {
      where.poNumber = { contains: filters.search, mode: 'insensitive' };
    }
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to + 'T23:59:59.999Z') } : {}),
      };
    }
    return this.prisma.purchaseOrder.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, nameAr: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } }, unit: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        branch: true,
        items: { include: { product: true, unit: true } },
        requisition: { select: { id: true, requisitionNo: true } },
      },
    });
    if (!po) throw new NotFoundException();
    return po;
  }

  async create(dto: any, userId: number) {
    const poNumber = await this.generatePoNo();
    const total = dto.items.reduce((sum: number, i: any) => sum + i.orderedQty * i.unitPrice, 0);
    const po = await this.prisma.purchaseOrder.create({
      data: {
        poNumber,
        supplierId: dto.supplierId,
        branchId: dto.branchId,
        requisitionId: dto.requisitionId,
        currency: dto.currency || 'QAR',
        notes: dto.notes,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
        totalAmount: total,
        createdById: userId,
        items: {
          create: dto.items.map((i: any) => ({
            productId: i.productId,
            unitId: i.unitId,
            orderedQty: i.orderedQty,
            unitPrice: i.unitPrice,
            expiryDate: i.expiryDate ? new Date(i.expiryDate) : undefined,
          })),
        },
      },
      include: { items: true, supplier: true },
    });
    this.notifications
      .emit({
        eventType: 'PO_CREATED',
        entityType: 'purchase_order',
        entityId: po.id,
        link: `/purchase-orders?id=${po.id}`,
        title: 'New purchase order created',
        titleAr: 'تم إنشاء أمر شراء جديد',
        message: `${po.poNumber} for ${(po as any).supplier?.name ?? 'supplier'} — ${po.currency} ${po.totalAmount.toFixed(2)}`,
        messageAr: `${po.poNumber} للمورد ${(po as any).supplier?.name ?? ''} — ${po.currency} ${po.totalAmount.toFixed(2)}`,
        branchId: po.branchId,
        actorId: userId,
        creatorId: userId,
      })
      .catch(() => {});
    return po;
  }

  async updateStatus(id: number, status: PurchaseOrderStatus, userId: number) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!po) throw new NotFoundException();

    // Receiving must always go through the batch-aware GRN path so it creates
    // proper batches, captures cost, and keeps FEFO/expiry correct. A status
    // shortcut can therefore never produce batch-less stock.
    if (status === PurchaseOrderStatus.PARTIALLY_RECEIVED) {
      throw new BadRequestException(
        'Use the Receive action to record a partial receipt (quantities are required).',
      );
    }
    if (status === PurchaseOrderStatus.FULLY_RECEIVED) {
      // Receive the outstanding (ordered − already received) quantity on every
      // line through receive(), which creates batches + cost history atomically
      // and auto-advances the status to FULLY_RECEIVED.
      const items = po.items
        .filter((i) => (i.receivedQty || 0) < i.orderedQty)
        .map((i) => ({ itemId: i.id, receivedQty: i.orderedQty }));
      if (items.length) {
        return this.receive(id, { items }, userId);
      }
      // Nothing outstanding — fall through to a plain status stamp below.
    }

    const updated = await this.runSerializable(async (tx) => {
      return tx.purchaseOrder.update({
        where: { id },
        data: {
          status,
          ...(status === PurchaseOrderStatus.FULLY_RECEIVED && { receivedDate: new Date() }),
        },
      });
    });
    // PARTIALLY_RECEIVED is rejected by the guard above and can never reach here,
    // so a fall-through status stamp is "received" only when FULLY_RECEIVED.
    const isReceived = status === PurchaseOrderStatus.FULLY_RECEIVED;
    const STATUS_EN: Record<string, string> = {
      DRAFT: 'set to draft',
      SENT_TO_SUPPLIER: 'sent to the supplier',
      PARTIALLY_RECEIVED: 'partially received',
      FULLY_RECEIVED: 'fully received',
      CANCELLED: 'cancelled',
    };
    const STATUS_AR: Record<string, string> = {
      DRAFT: 'مسودة',
      SENT_TO_SUPPLIER: 'تم الإرسال إلى المورد',
      PARTIALLY_RECEIVED: 'تم الاستلام جزئياً',
      FULLY_RECEIVED: 'تم الاستلام بالكامل',
      CANCELLED: 'تم الإلغاء',
    };
    this.notifications
      .emit({
        eventType: isReceived ? 'PO_RECEIVED' : 'PO_STATUS_UPDATED',
        entityType: 'purchase_order',
        entityId: po.id,
        link: `/purchase-orders?id=${po.id}`,
        title: 'Purchase order updated',
        titleAr: 'تم تحديث أمر الشراء',
        message: `${po.poNumber} was ${STATUS_EN[status] ?? status}`,
        messageAr: `${po.poNumber} ${STATUS_AR[status] ?? status}`,
        branchId: po.branchId,
        actorId: userId,
        creatorId: po.createdById ?? undefined,
      })
      .catch(() => {});
    return updated;
  }

  /**
   * Edit a purchase order's header and/or line items (admin / procurement /
   * warehouse). Editing is blocked once a PO is fully received or cancelled to
   * avoid inventory inconsistencies. When `items` are supplied they fully
   * replace the existing lines and the PO total is recomputed.
   */
  async update(id: number, dto: any, userId: number) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!po) throw new NotFoundException();
    if (po.status === PurchaseOrderStatus.FULLY_RECEIVED || po.status === PurchaseOrderStatus.CANCELLED) {
      throw new BadRequestException(`Cannot edit a ${po.status} purchase order`);
    }

    const data: any = {};
    if (dto.supplierId !== undefined) data.supplierId = dto.supplierId;
    if (dto.branchId !== undefined) data.branchId = dto.branchId;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.expectedDate !== undefined) data.expectedDate = dto.expectedDate ? new Date(dto.expectedDate) : null;

    if (Array.isArray(dto.items)) {
      // Replace all line items in a transaction and recompute the total.
      const total = dto.items.reduce((s: number, i: any) => s + (Number(i.orderedQty) || 0) * (Number(i.unitPrice) || 0), 0);
      await this.prisma.$transaction([
        this.prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } }),
        this.prisma.purchaseOrder.update({
          where: { id },
          data: {
            ...data,
            totalAmount: Math.round(total * 100) / 100,
            items: {
              create: dto.items.map((i: any) => ({
                productId: i.productId,
                unitId: i.unitId || undefined,
                orderedQty: Number(i.orderedQty) || 0,
                unitPrice: Number(i.unitPrice) || 0,
                receivedQty: Number(i.receivedQty) || 0,
                expiryDate: i.expiryDate ? new Date(i.expiryDate) : undefined,
              })),
            },
          },
        }),
      ]);
    } else if (Object.keys(data).length) {
      await this.prisma.purchaseOrder.update({ where: { id }, data });
    }

    return this.findOne(id);
  }

  /**
   * Receive items against a PO. The caller may enter the ACTUAL received
   * quantity and the ACTUAL unit price for each line. Every price that differs
   * from the product's current cost is logged to SupplierPriceHistory so price
   * trends are captured. Updating the product master cost is OPTIONAL
   * (updateCostPrice flag). Inventory is increased by the newly received qty,
   * the PO total is recomputed from the final unit prices, and the status moves
   * to FULLY_RECEIVED or PARTIALLY_RECEIVED automatically.
   */
  async receive(
    id: number,
    dto: { items: { itemId: number; receivedQty: number; unitPrice?: number; dateReceived?: string; manufactureDate?: string; expiryDate?: string }[]; updateCostPrice?: boolean; notes?: string },
    userId: number,
  ) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: { items: { include: { product: true } } } });
    if (!po) throw new NotFoundException();
    if (po.status === PurchaseOrderStatus.FULLY_RECEIVED || po.status === PurchaseOrderStatus.CANCELLED) {
      throw new BadRequestException(`Cannot receive a ${po.status} purchase order`);
    }
    if (!dto.items?.length) throw new BadRequestException('No items to receive');

    // Atomic receipt: every stock movement + supplier price-history row +
    // product cost update + line update + the PO total/status recompute commit
    // in ONE transaction, so a partial failure can never leave stock credited
    // against an un-updated purchase order.
    const { updated, allReceived } = await this.runSerializable(async (tx) => {
      for (const line of dto.items) {
        const item = po.items.find((i) => i.id === line.itemId);
        if (!item) continue;

        const newReceived = Math.max(0, Number(line.receivedQty) || 0);
        const delta = newReceived - (item.receivedQty || 0);
        const finalPrice = line.unitPrice != null ? Number(line.unitPrice) : item.unitPrice;

        // 1) Increase inventory for the newly received quantity only.
        if (delta > 0) {
          // Per requirement #4: capture expiry PER BATCH at the GRN stage.
          const resolved = this.resolveBatchExpiry(item.product, line);
          let batchId: number | null = null;
          let expiryIso: string | undefined = item.expiryDate?.toISOString();
          let manufactureIso: string | undefined;
          let batchNumber: string | undefined;

          if (resolved) {
            const batchNo = await this.generateBatchNo(tx, item.product.sku);
            const batch = await tx.batch.create({
              data: {
                productId: item.productId,
                batchNumber: batchNo,
                manufactureDate: resolved.manufactureDate,
                expiryDate: resolved.expiryDate,
                unitCost: finalPrice,
                receivedAtBranchId: po.branchId,
                receivedDate: line.dateReceived ? new Date(line.dateReceived) : new Date(),
              },
            });
            batchId = batch.id;
            expiryIso = resolved.expiryDate?.toISOString();
            manufactureIso = resolved.manufactureDate?.toISOString();
            batchNumber = batchNo;
          }

          await this.inventoryService.applyAdjustment(tx, {
            productId: item.productId,
            branchId: po.branchId,
            quantity: delta,
            type: InventoryTxType.RECEIPT,
            notes: `Received from PO ${po.poNumber}`,
            batchId,
            batchNumber,
            expiryDate: expiryIso,
            manufactureDate: manufactureIso,
            performedById: userId,
          });
        }

        // 2) Log a supplier price change when the received price differs.
        if (line.unitPrice != null && finalPrice !== item.product.costPrice) {
          await tx.supplierPriceHistory.create({
            data: {
              supplierId: po.supplierId,
              productId: item.productId,
              oldPrice: item.product.costPrice,
              newPrice: finalPrice,
              changedById: userId,
              source: 'PO_RECEIPT',
              notes: `PO ${po.poNumber} receipt${dto.notes ? ` — ${dto.notes}` : ''}`,
            },
          });
          // 3) Optionally roll the new price into the product master cost.
          if (dto.updateCostPrice) {
            await tx.product.update({ where: { id: item.productId }, data: { costPrice: finalPrice } });
          }
        }

        // 4) Persist received qty + final unit price on the line.
        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { receivedQty: newReceived, unitPrice: finalPrice },
        });
      }

      // Recompute total from final unit prices and decide the new status.
      const fresh = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
      const total = fresh!.items.reduce((sum, i) => sum + i.orderedQty * i.unitPrice, 0);
      const allRcv = fresh!.items.every((i) => (i.receivedQty || 0) >= i.orderedQty);
      const anyReceived = fresh!.items.some((i) => (i.receivedQty || 0) > 0);
      const newStatus = allRcv
        ? PurchaseOrderStatus.FULLY_RECEIVED
        : anyReceived
          ? PurchaseOrderStatus.PARTIALLY_RECEIVED
          : po.status;

      const upd = await tx.purchaseOrder.update({
        where: { id },
        data: {
          totalAmount: Math.round(total * 100) / 100,
          status: newStatus,
          ...(newStatus === PurchaseOrderStatus.FULLY_RECEIVED && { receivedDate: new Date() }),
        },
      });
      return { updated: upd, allReceived: allRcv };
    });

    this.notifications
      .emit({
        eventType: 'PO_RECEIVED',
        entityType: 'purchase_order',
        entityId: po.id,
        link: `/purchase-orders?id=${po.id}`,
        title: 'Purchase order received',
        titleAr: 'تم استلام أمر الشراء',
        message: `${po.poNumber} was ${allReceived ? 'fully' : 'partially'} received — ${po.currency} ${updated.totalAmount.toFixed(2)}`,
        messageAr: `${po.poNumber} ${allReceived ? 'تم استلامه بالكامل' : 'تم استلامه جزئياً'} — ${po.currency} ${updated.totalAmount.toFixed(2)}`,
        branchId: po.branchId,
        actorId: userId,
        creatorId: po.createdById ?? undefined,
      })
      .catch(() => {});

    return this.findOne(id);
  }
}
