import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface RecipeComponentInput {
  componentProductId: number;
  quantity: number;
  unitId?: number;
  wastePct?: number;
  notes?: string;
}

export interface CreateRecipeInput {
  productId: number;
  name: string;
  yieldQty?: number;
  yieldUnitId?: number;
  prepLossPct?: number;
  cookingLossPct?: number;
  wastePct?: number;
  notes?: string;
  notesAr?: string;
  imageUrl?: string;
  isActive?: boolean;
  components: RecipeComponentInput[];
}

export type UpdateRecipeInput = Partial<CreateRecipeInput>;

@Injectable()
export class RecipesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  findAll(productId?: number) {
    return this.prisma.recipe.findMany({
      where: productId ? { productId } : undefined,
      include: {
        product: { select: { id: true, sku: true, name: true, nameAr: true } },
        yieldUnit: true,
        components: {
          include: {
            componentProduct: {
              select: { id: true, sku: true, name: true, nameAr: true, costPrice: true },
            },
            unit: true,
          },
        },
      },
      orderBy: [{ productId: 'asc' }, { version: 'desc' }],
    });
  }

  async findOne(id: number) {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id },
      include: {
        product: true,
        yieldUnit: true,
        components: { include: { componentProduct: true, unit: true } },
      },
    });
    if (!recipe) throw new NotFoundException(`Recipe ${id} not found`);
    return recipe;
  }

  /** Active recipe for a finished/sellable product (used by the sales engine). */
  findActiveForProduct(productId: number) {
    return this.prisma.recipe.findFirst({
      where: { productId, isActive: true },
      orderBy: { version: 'desc' },
      include: { components: true },
    });
  }

  private validateComponents(productId: number, components: RecipeComponentInput[]) {
    if (!components?.length) {
      throw new BadRequestException('A recipe must contain at least one component.');
    }
    for (const c of components) {
      if (c.componentProductId === productId) {
        throw new BadRequestException(
          'A recipe cannot contain its own finished product as an ingredient.',
        );
      }
      if (!(c.quantity > 0)) {
        throw new BadRequestException('Every component quantity must be greater than 0.');
      }
    }
  }

  async create(dto: CreateRecipeInput, userId?: number) {
    this.validateComponents(dto.productId, dto.components);

    // New recipes supersede the previous active recipe for the same product.
    const latest = await this.prisma.recipe.findFirst({
      where: { productId: dto.productId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;

    const recipe = await this.prisma.$transaction(async (tx) => {
      if (dto.isActive !== false) {
        await tx.recipe.updateMany({
          where: { productId: dto.productId, isActive: true },
          data: { isActive: false },
        });
      }
      return tx.recipe.create({
        data: {
          productId: dto.productId,
          name: dto.name,
          version,
          isActive: dto.isActive ?? true,
          yieldQty: dto.yieldQty ?? 1,
          yieldUnitId: dto.yieldUnitId ?? null,
          prepLossPct: dto.prepLossPct ?? 0,
          cookingLossPct: dto.cookingLossPct ?? 0,
          wastePct: dto.wastePct ?? 0,
          notes: dto.notes,
          notesAr: dto.notesAr,
          imageUrl: dto.imageUrl,
          createdById: userId ?? null,
          components: {
            create: dto.components.map((c) => ({
              componentProductId: c.componentProductId,
              quantity: c.quantity,
              unitId: c.unitId ?? null,
              wastePct: c.wastePct ?? 0,
              notes: c.notes,
            })),
          },
        },
        include: { components: true },
      });
    });

    await this.audit.create({
      userId,
      action: 'CREATE',
      entity: 'Recipe',
      entityId: String(recipe.id),
      newValues: recipe as any,
    });
    return recipe;
  }

  async update(id: number, dto: UpdateRecipeInput, userId?: number) {
    const existing = await this.findOne(id);
    if (dto.components) this.validateComponents(dto.productId ?? existing.productId, dto.components);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.components) {
        await tx.recipeComponent.deleteMany({ where: { recipeId: id } });
        await tx.recipeComponent.createMany({
          data: dto.components.map((c) => ({
            recipeId: id,
            componentProductId: c.componentProductId,
            quantity: c.quantity,
            unitId: c.unitId ?? null,
            wastePct: c.wastePct ?? 0,
            notes: c.notes,
          })),
        });
      }
      return tx.recipe.update({
        where: { id },
        data: {
          name: dto.name,
          yieldQty: dto.yieldQty,
          yieldUnitId: dto.yieldUnitId,
          prepLossPct: dto.prepLossPct,
          cookingLossPct: dto.cookingLossPct,
          wastePct: dto.wastePct,
          notes: dto.notes,
          notesAr: dto.notesAr,
          imageUrl: dto.imageUrl,
          isActive: dto.isActive,
        },
        include: { components: true },
      });
    });

    await this.audit.create({
      userId,
      action: 'UPDATE',
      entity: 'Recipe',
      entityId: String(id),
      oldValues: existing as any,
      newValues: updated as any,
    });
    return updated;
  }

  async setActive(id: number, isActive: boolean, userId?: number) {
    const recipe = await this.findOne(id);
    if (isActive) {
      await this.prisma.recipe.updateMany({
        where: { productId: recipe.productId, isActive: true, id: { not: id } },
        data: { isActive: false },
      });
    }
    return this.prisma.recipe.update({ where: { id }, data: { isActive } });
  }

  async approve(id: number, userId?: number) {
    await this.findOne(id);
    return this.prisma.recipe.update({ where: { id }, data: { isApproved: true } });
  }

  async remove(id: number, userId?: number) {
    await this.findOne(id);
    await this.prisma.recipe.delete({ where: { id } });
    await this.audit.create({
      userId,
      action: 'DELETE',
      entity: 'Recipe',
      entityId: String(id),
    });
    return { success: true };
  }

  /**
   * Roll up the standard cost of one yield-batch and the per-unit cost of the
   * finished product, using each component's current `costPrice` and the
   * recipe's loss factors. Used by menu engineering / food-cost reports.
   */
  async cost(id: number) {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id },
      include: { components: { include: { componentProduct: true } } },
    });
    if (!recipe) throw new NotFoundException(`Recipe ${id} not found`);

    const lossMultiplier =
      1 +
      (recipe.prepLossPct + recipe.cookingLossPct + recipe.wastePct) / 100;

    const lines = recipe.components.map((c) => {
      const qty = c.quantity * (1 + (c.wastePct ?? 0) / 100);
      const unitCost = c.componentProduct?.costPrice ?? 0;
      const lineCost = qty * unitCost;
      return {
        componentProductId: c.componentProductId,
        sku: c.componentProduct?.sku,
        name: c.componentProduct?.name,
        quantity: qty,
        unitCost,
        lineCost,
      };
    });

    const rawBatchCost = lines.reduce((s, l) => s + l.lineCost, 0);
    const batchCost = rawBatchCost * lossMultiplier;
    const yieldQty = recipe.yieldQty || 1;
    const unitCost = batchCost / yieldQty;

    return {
      recipeId: recipe.id,
      productId: recipe.productId,
      yieldQty,
      lossMultiplier,
      rawBatchCost,
      batchCost,
      unitCost,
      lines,
    };
  }
}
