import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { FinanceService } from '../finance/finance.service';
import { PromotionsService } from '../promotions/promotions.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ORDER_COMPLETED, OrderCompletedEvent } from '../../common/events/order-events';
import {
  InventoryTxType,
  OrderChannel,
  OrderStatus,
  PaymentMethod,
  Prisma,
  TableStatus,
} from '@prisma/client';

export interface OrderItemInput {
  productId: number;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxAmount?: number;
  notes?: string;
}

export interface CreateOrderInput {
  branchId: number;
  channel?: OrderChannel;
  customerId?: number;
  tableName?: string;
  serviceCharge?: number;
  tip?: number;
  notes?: string;
  couponCode?: string;
  items?: OrderItemInput[];
}

export interface PaymentInput {
  method: PaymentMethod;
  amount: number;
  reference?: string;
  giftCardCode?: string;
}

// 1 loyalty point per whole currency unit spent. Tune via settings later.
const LOYALTY_RATE = 1;

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
    private finance: FinanceService,
    private promotions: PromotionsService,
    private events: EventEmitter2,
  ) {}

  private orderInclude = {
    items: {
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            nameAr: true,
            category: { select: { id: true, name: true, nameAr: true } },
          },
        },
      },
    },
    payments: true,
    customer: { select: { id: true, name: true, phone: true, loyaltyPoints: true } },
    branch: { select: { id: true, name: true, nameAr: true } },
  } satisfies Prisma.OrderInclude;

  private async generateOrderNo(branchId: number): Promise<string> {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.prisma.order.count();
    return `ORD-${stamp}-B${branchId}-${String(count + 1).padStart(5, '0')}`;
  }

  /** Recompute monetary roll-up fields from the current line items. */
  private totals(
    items: Array<{ quantity: number; unitPrice: number; discount: number; taxAmount: number }>,
    serviceCharge: number,
    tip: number,
    couponDiscount = 0,
  ) {
    const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const itemDiscounts = items.reduce((s, i) => s + (i.discount ?? 0), 0);
    const discountTotal = itemDiscounts + couponDiscount;
    const taxTotal = items.reduce((s, i) => s + (i.taxAmount ?? 0), 0);
    const total = subtotal - discountTotal + taxTotal + serviceCharge + tip;
    return { subtotal, discountTotal, taxTotal, total };
  }

  private async recompute(orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    const t = this.totals(order.items, order.serviceCharge, order.tip, order.couponDiscount);
    return this.prisma.order.update({
      where: { id: orderId },
      data: t,
      include: this.orderInclude,
    });
  }

  findAll(filters?: { branchId?: number; status?: OrderStatus; customerId?: number }) {
    return this.prisma.order.findMany({
      where: {
        ...(filters?.branchId ? { branchId: filters.branchId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.customerId ? { customerId: filters.customerId } : {}),
      },
      include: this.orderInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: this.orderInclude,
    });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return order;
  }

  async create(dto: CreateOrderInput, userId?: number) {
    // An order may start empty (a fresh POS ticket) and gain items via addItem.
    const orderNo = await this.generateOrderNo(dto.branchId);
    const items = (dto.items ?? []).map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discount: i.discount ?? 0,
      taxAmount: i.taxAmount ?? 0,
      lineTotal: i.quantity * i.unitPrice - (i.discount ?? 0) + (i.taxAmount ?? 0),
      notes: i.notes,
    }));
    const t = this.totals(
      items,
      dto.serviceCharge ?? 0,
      dto.tip ?? 0,
    );
    // Validate & price an optional coupon against the gross item subtotal.
    let couponCode: string | null = null;
    let couponDiscount = 0;
    if (dto.couponCode) {
      const res = await this.promotions.validateCoupon(dto.couponCode, t.subtotal);
      couponCode = res.code;
      couponDiscount = res.discount;
    }
    const totals = this.totals(items, dto.serviceCharge ?? 0, dto.tip ?? 0, couponDiscount);
    const order = await this.prisma.order.create({
      data: {
        orderNo,
        branchId: dto.branchId,
        channel: dto.channel ?? OrderChannel.DINE_IN,
        customerId: dto.customerId ?? null,
        tableName: dto.tableName,
        serviceCharge: dto.serviceCharge ?? 0,
        tip: dto.tip ?? 0,
        notes: dto.notes,
        couponCode,
        couponDiscount,
        createdById: userId ?? null,
        ...totals,
        items: { create: items },
      },
      include: this.orderInclude,
    });
    return order;
  }

  private async assertOpen(orderId: number) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    if (order.status !== OrderStatus.OPEN && order.status !== OrderStatus.HELD) {
      throw new BadRequestException(
        `Order ${order.orderNo} is ${order.status}; only OPEN/HELD orders can be modified.`,
      );
    }
    return order;
  }

  async addItem(orderId: number, dto: OrderItemInput) {
    await this.assertOpen(orderId);
    await this.prisma.orderItem.create({
      data: {
        orderId,
        productId: dto.productId,
        quantity: dto.quantity,
        unitPrice: dto.unitPrice,
        discount: dto.discount ?? 0,
        taxAmount: dto.taxAmount ?? 0,
        lineTotal: dto.quantity * dto.unitPrice - (dto.discount ?? 0) + (dto.taxAmount ?? 0),
        notes: dto.notes,
      },
    });
    return this.recompute(orderId);
  }

  async removeItem(orderId: number, itemId: number) {
    await this.assertOpen(orderId);
    const item = await this.prisma.orderItem.findFirst({ where: { id: itemId, orderId } });
    if (!item) throw new NotFoundException(`Item ${itemId} not found on order ${orderId}`);
    await this.prisma.orderItem.delete({ where: { id: itemId } });
    return this.recompute(orderId);
  }

  async setStatus(orderId: number, status: OrderStatus) {
    await this.assertOpen(orderId);
    await this.prisma.order.update({ where: { id: orderId }, data: { status } });
    return this.findOne(orderId);
  }

  /**
   * Apply (or clear) a coupon on an existing OPEN/HELD order — used when a
   * cashier picks up a waiter's bill and applies a discount before payment.
   * Pass an empty/undefined code to remove a previously applied coupon.
   */
  async applyCoupon(orderId: number, code?: string | null) {
    await this.assertOpen(orderId);
    let couponCode: string | null = null;
    let couponDiscount = 0;
    if (code && code.trim()) {
      const items = await this.prisma.orderItem.findMany({ where: { orderId } });
      const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const res = await this.promotions.validateCoupon(code.trim(), subtotal);
      couponCode = res.code;
      couponDiscount = res.discount;
    }
    await this.prisma.order.update({
      where: { id: orderId },
      data: { couponCode, couponDiscount },
    });
    return this.recompute(orderId);
  }

  /** Release a dine-in table back to AVAILABLE once its bill is settled. */
  private async freeTable(branchId: number, tableName?: string | null) {
    if (!tableName) return;
    try {
      await this.prisma.restaurantTable.updateMany({
        where: { branchId, name: tableName, status: { not: TableStatus.AVAILABLE } },
        data: { status: TableStatus.AVAILABLE },
      });
    } catch {
      /* table linkage is best-effort; never block a completed sale */
    }
  }

  async voidOrder(orderId: number) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    if (order.status === OrderStatus.COMPLETED) {
      throw new BadRequestException('Completed orders cannot be voided; issue a refund instead.');
    }
    await this.prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.VOIDED } });
    return this.findOne(orderId);
  }

  async addPayment(orderId: number, dto: PaymentInput, userId?: number) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    if (order.status === OrderStatus.VOIDED || order.status === OrderStatus.REFUNDED) {
      throw new BadRequestException(`Cannot take payment on a ${order.status} order.`);
    }
    if (!(dto.amount > 0)) throw new BadRequestException('Payment amount must be positive.');

    // Gift card tender: draw the amount down from the card balance first.
    if (dto.method === PaymentMethod.GIFT_CARD) {
      if (!dto.giftCardCode) {
        throw new BadRequestException('giftCardCode is required for a gift card payment.');
      }
      await this.promotions.redeemGiftCard(dto.giftCardCode, dto.amount);
    }

    await this.prisma.payment.create({
      data: {
        orderId,
        method: dto.method,
        amount: dto.amount,
        reference: dto.reference ?? dto.giftCardCode,
        receivedById: userId ?? null,
      },
    });
    const paid = await this.prisma.payment.aggregate({
      where: { orderId },
      _sum: { amount: true },
    });
    await this.prisma.order.update({
      where: { id: orderId },
      data: { paidTotal: paid._sum.amount ?? 0 },
    });
    return this.findOne(orderId);
  }

  /**
   * KEYSTONE — Complete a sale.
   * Within ONE serializable transaction:
   *   1. Re-validate the order is OPEN/HELD and fully paid.
   *   2. For each line item, explode its active Recipe (BOM) and deduct every
   *      component from branch stock via the existing FEFO inventory engine
   *      (one SALE inventory_transaction per component per batch consumed).
   *      Items with no recipe deduct the sold product itself (retail goods).
   *   3. Capture food cost + gross profit snapshots on the order and each line.
   *   4. Mark COMPLETED and accrue loyalty points.
   * If any component is short on stock the whole transaction rolls back — no
   * partial sale, no orphaned inventory movements.
   */
  async complete(orderId: number, opts: { allowUnpaid?: boolean } = {}, userId?: number) {
    const pre = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!pre) throw new NotFoundException(`Order ${orderId} not found`);
    if (pre.status !== OrderStatus.OPEN && pre.status !== OrderStatus.HELD) {
      throw new BadRequestException(`Order ${pre.orderNo} is already ${pre.status}.`);
    }
    if (!pre.items.length) {
      throw new BadRequestException('Cannot complete an order with no items.');
    }
    if (!opts.allowUnpaid && pre.paidTotal + 1e-6 < pre.total) {
      throw new BadRequestException(
        `Order not fully paid: paid ${pre.paidTotal}, total ${pre.total}.`,
      );
    }

    const completed = await this.prisma.$transaction(
      async (tx) => {
        let orderFoodCost = 0;

        for (const item of pre.items) {
          const recipe = await tx.recipe.findFirst({
            where: { productId: item.productId, isActive: true },
            orderBy: { version: 'desc' },
            include: { components: { include: { componentProduct: { select: { costPrice: true } } } } },
          });

          let lineCost = 0;

          if (recipe && recipe.components.length) {
            const yieldQty = recipe.yieldQty || 1;
            const recipeLoss =
              1 + (recipe.prepLossPct + recipe.cookingLossPct + recipe.wastePct) / 100;

            for (const comp of recipe.components) {
              const perUnit =
                (comp.quantity * (1 + (comp.wastePct ?? 0) / 100)) / yieldQty;
              const deductQty = perUnit * item.quantity * recipeLoss;
              if (deductQty <= 0) continue;

              await this.inventory.applyManualAdjustment(tx, {
                productId: comp.componentProductId,
                branchId: pre.branchId,
                quantity: deductQty,
                type: InventoryTxType.SALE,
                notes: `Sale ${pre.orderNo} — recipe of product #${item.productId}`,
                performedById: userId,
              });

              lineCost += deductQty * (comp.componentProduct?.costPrice ?? 0);
            }
          } else {
            // No recipe: treat the sold product as a stocked item and deduct it directly.
            const prod = await tx.product.findUnique({
              where: { id: item.productId },
              select: { costPrice: true },
            });
            await this.inventory.applyManualAdjustment(tx, {
              productId: item.productId,
              branchId: pre.branchId,
              quantity: item.quantity,
              type: InventoryTxType.SALE,
              notes: `Sale ${pre.orderNo} — direct stock item`,
              performedById: userId,
            });
            lineCost = item.quantity * (prod?.costPrice ?? 0);
          }

          orderFoodCost += lineCost;
          await tx.orderItem.update({
            where: { id: item.id },
            data: {
              lineCost,
              unitCost: item.quantity ? lineCost / item.quantity : 0,
            },
          });
        }

        const grossProfit = pre.total - orderFoodCost;

        const completed = await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.COMPLETED,
            completedAt: new Date(),
            foodCost: orderFoodCost,
            grossProfit,
          },
          include: this.orderInclude,
        });

        // Loyalty accrual.
        if (pre.customerId) {
          await tx.customer.update({
            where: { id: pre.customerId },
            data: { loyaltyPoints: { increment: Math.floor(pre.total * LOYALTY_RATE) } },
          });
        }

        // Finance journal: revenue + COGS (+ tax / service / tip) for this sale.
        await this.finance.recordSale(
          {
            orderId: pre.id,
            orderNo: pre.orderNo,
            branchId: pre.branchId,
            revenue: pre.subtotal - pre.discountTotal,
            tax: pre.taxTotal,
            serviceCharge: pre.serviceCharge,
            tip: pre.tip,
            cogs: orderFoodCost,
            createdById: userId,
          },
          tx,
        );

        return completed;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 },
    );

    // Post-commit: count the coupon redemption. The sale is already final, so a
    // redemption-limit race here must not roll back a completed, paid order.
    if (pre.couponCode) {
      try {
        await this.prisma.coupon.update({
          where: { code: pre.couponCode },
          data: { redeemedCount: { increment: 1 } },
        });
      } catch {
        /* coupon went away or hit its cap after checkout — ignore */
      }
    }

    // Post-commit: fire the decoupled domain event for non-blocking side
    // effects (analytics, dashboard refresh, notifications). Never awaited into
    // the checkout path — a listener failure cannot affect the committed sale.
    const evt: OrderCompletedEvent = {
      orderId: completed.id,
      orderNo: completed.orderNo,
      branchId: completed.branchId,
      channel: completed.channel,
      total: completed.total,
      foodCost: completed.foodCost,
      grossProfit: completed.grossProfit,
      customerId: completed.customerId,
      completedAt: completed.completedAt ?? new Date(),
    };
    this.events.emit(ORDER_COMPLETED, evt);

    // Post-commit: release the dine-in table (best-effort, non-blocking).
    await this.freeTable(completed.branchId, completed.tableName);

    return completed;
  }
}
