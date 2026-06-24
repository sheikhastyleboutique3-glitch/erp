import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryTxType, Prisma, ProductionOrderStatus } from '@prisma/client';

export interface CreateProductionInput {
  branchId: number;
  productId: number; // finished/semi product to produce
  recipeId?: number; // defaults to the product's active recipe
  plannedQty: number;
  batchNumber?: string;
  expiryDate?: string;
  notes?: string;
}

@Injectable()
export class ProductionService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
  ) {}

  private async generateNo(): Promise<string> {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.prisma.productionOrder.count();
    return `PRD-${stamp}-${String(count + 1).padStart(5, '0')}`;
  }

  findAll(filters?: { branchId?: number; status?: ProductionOrderStatus }) {
    return this.prisma.productionOrder.findMany({
      where: {
        ...(filters?.branchId ? { branchId: filters.branchId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      include: { consumptions: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: number) {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id },
      include: { consumptions: true },
    });
    if (!order) throw new NotFoundException(`Production order ${id} not found`);
    return order;
  }

  /** Build planned consumption lines by exploding the recipe scaled to plannedQty. */
  private async planConsumption(productId: number, recipeId: number | undefined, plannedQty: number) {
    const recipe = await this.prisma.recipe.findFirst({
      where: recipeId ? { id: recipeId } : { productId, isActive: true },
      orderBy: { version: 'desc' },
      include: { components: { include: { componentProduct: { select: { costPrice: true } } } } },
    });
    if (!recipe || !recipe.components.length) {
      throw new BadRequestException(
        `No active recipe with components found for product #${productId}.`,
      );
    }
    const yieldQty = recipe.yieldQty || 1;
    const recipeLoss = 1 + (recipe.prepLossPct + recipe.cookingLossPct + recipe.wastePct) / 100;
    const batches = plannedQty / yieldQty;
    const lines = recipe.components.map((c) => {
      const qty = c.quantity * (1 + (c.wastePct ?? 0) / 100) * batches * recipeLoss;
      const unitCost = c.componentProduct?.costPrice ?? 0;
      return {
        componentProductId: c.componentProductId,
        plannedQty: qty,
        unitCost,
        lineCost: qty * unitCost,
      };
    });
    return { recipeId: recipe.id, lines };
  }

  async create(dto: CreateProductionInput, userId?: number) {
    if (!(dto.plannedQty > 0)) throw new BadRequestException('plannedQty must be > 0.');
    const { recipeId, lines } = await this.planConsumption(dto.productId, dto.recipeId, dto.plannedQty);
    const productionNo = await this.generateNo();
    return this.prisma.productionOrder.create({
      data: {
        productionNo,
        branchId: dto.branchId,
        productId: dto.productId,
        recipeId,
        plannedQty: dto.plannedQty,
        batchNumber: dto.batchNumber,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
        notes: dto.notes,
        createdById: userId ?? null,
        consumptions: { create: lines },
      },
      include: { consumptions: true },
    });
  }

  async start(id: number) {
    const order = await this.findOne(id);
    if (order.status !== ProductionOrderStatus.PLANNED) {
      throw new BadRequestException(`Only PLANNED orders can be started (is ${order.status}).`);
    }
    return this.prisma.productionOrder.update({
      where: { id },
      data: { status: ProductionOrderStatus.IN_PROGRESS, startedAt: new Date() },
      include: { consumptions: true },
    });
  }

  async cancel(id: number) {
    const order = await this.findOne(id);
    if (order.status === ProductionOrderStatus.COMPLETED) {
      throw new BadRequestException('Completed production cannot be cancelled.');
    }
    return this.prisma.productionOrder.update({
      where: { id },
      data: { status: ProductionOrderStatus.CANCELLED },
    });
  }

  /**
   * Complete a production run inside one serializable transaction:
   *   1. Consume every planned component from branch stock (PRODUCTION_CONSUME, FEFO).
   *   2. Yield `producedQty` of the finished product into stock (PRODUCTION_YIELD),
   *      stamping batch + expiry and the rolled-up unit cost.
   * A stock shortfall on any component rolls the whole run back.
   * Production is a stock transformation (raw -> finished); COGS is recognised
   * later at the point of sale, so no P&L finance line is posted here.
   */
  async complete(id: number, producedQty: number | undefined, userId?: number) {
    const order = await this.findOne(id);
    if (order.status === ProductionOrderStatus.COMPLETED) {
      throw new BadRequestException('Production order already completed.');
    }
    if (order.status === ProductionOrderStatus.CANCELLED) {
      throw new BadRequestException('Cancelled production cannot be completed.');
    }
    const yielded = producedQty ?? order.plannedQty;
    if (!(yielded > 0)) throw new BadRequestException('producedQty must be > 0.');

    return this.prisma.$transaction(
      async (tx) => {
        let totalCost = 0;

        for (const c of order.consumptions) {
          if (c.plannedQty <= 0) continue;
          await this.inventory.applyManualAdjustment(tx, {
            productId: c.componentProductId,
            branchId: order.branchId,
            quantity: c.plannedQty,
            type: InventoryTxType.PRODUCTION_CONSUME,
            notes: `Production ${order.productionNo}`,
            performedById: userId,
          });
          totalCost += c.lineCost;
          await tx.productionConsumption.update({
            where: { id: c.id },
            data: { actualQty: c.plannedQty },
          });
        }

        const unitCost = yielded ? totalCost / yielded : 0;

        // Yield the finished product into stock (creates/credits a batch when
        // the product is expiry-tracked and an expiry can be resolved).
        await this.inventory.applyManualAdjustment(tx, {
          productId: order.productId,
          branchId: order.branchId,
          quantity: yielded,
          type: InventoryTxType.PRODUCTION_YIELD,
          unitCost,
          batchNumber: order.batchNumber ?? undefined,
          expiryDate: order.expiryDate ? order.expiryDate.toISOString() : undefined,
          notes: `Production ${order.productionNo} yield`,
          performedById: userId,
        });

        return tx.productionOrder.update({
          where: { id },
          data: {
            status: ProductionOrderStatus.COMPLETED,
            producedQty: yielded,
            totalCost,
            completedAt: new Date(),
          },
          include: { consumptions: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 },
    );
  }
}
