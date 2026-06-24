import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(categoryId?: number, search?: string, includeArchived?: boolean) {
    return this.prisma.product.findMany({
      where: {
        isActive: true,
        ...(includeArchived ? {} : { isArchived: false }),
        ...(categoryId && { categoryId }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { nameAr: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      include: {
        category: { select: { id: true, name: true, nameAr: true, icon: true } },
        unit: { select: { id: true, name: true, nameAr: true, abbreviation: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
    // allergens / allergenNotes are scalar columns and returned by default.
  }

  async findOne(id: number) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        unit: true,
        supplier: true,
        inventory: { include: { branch: { select: { id: true, name: true } } } },
      },
    });
    if (!p) throw new NotFoundException('Product not found');
    return p;
  }

  async create(dto: any, userId?: number) {
    if (!dto.sku) {
      dto.sku = await this.generateSku(dto.categoryId);
    }
    const product = await this.prisma.product.create({
      data: dto,
      include: { category: true, unit: true },
    });
    // Audit
    this.audit.create({
      userId,
      action: 'CREATE',
      entity: 'product',
      entityId: String(product.id),
      newValues: { name: product.name, sku: product.sku, costPrice: product.costPrice },
    }).catch(() => {});
    return product;
  }

  async update(id: number, dto: any, userId?: number) {
    const before = await this.prisma.product.findUnique({
      where: { id },
      select: { name: true, costPrice: true, isActive: true, supplierId: true },
    });

    const product = await this.prisma.product.update({
      where: { id },
      data: dto,
      include: { category: true, unit: true },
    });

    // Record price change in supplier price history
    if (
      before &&
      dto.costPrice !== undefined &&
      before.costPrice !== dto.costPrice &&
      (product.supplierId || before.supplierId)
    ) {
      const supplierId = product.supplierId || before.supplierId;
      try {
        await this.prisma.supplierPriceHistory.create({
          data: {
            supplierId: supplierId!,
            productId: id,
            oldPrice: before.costPrice,
            newPrice: dto.costPrice,
            changedById: userId ?? null,
            source: 'MANUAL',
            notes: `Product update: ${before.name}`,
          },
        });
      } catch {
        // Silently fail if table doesn't exist yet
      }
    }

    this.audit.create({
      userId,
      action: 'UPDATE',
      entity: 'product',
      entityId: String(id),
      oldValues: before ?? undefined,
      newValues: { name: product.name, costPrice: product.costPrice },
    }).catch(() => {});
    return product;
  }

  async findArchived() {
    return this.prisma.product.findMany({
      where: { isArchived: true },
      include: {
        category: { select: { id: true, name: true, nameAr: true, icon: true } },
        unit: { select: { id: true, name: true, nameAr: true, abbreviation: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { archivedAt: 'desc' },
    });
  }

  async restore(id: number, userId?: number) {
    const product = await this.prisma.product.update({
      where: { id },
      data: { isArchived: false, archivedAt: null, isActive: true },
      include: { category: true, unit: true },
    });
    this.audit.create({
      userId,
      action: 'RESTORE',
      entity: 'product',
      entityId: String(id),
      newValues: { isArchived: false, isActive: true },
    }).catch(() => {});
    return product;
  }

  async archive(id: number, userId?: number) {
    const product = await this.prisma.product.update({
      where: { id },
      data: { isArchived: true, archivedAt: new Date(), isActive: false },
    });
    this.audit.create({
      userId,
      action: 'ARCHIVE',
      entity: 'product',
      entityId: String(id),
      newValues: { isArchived: true },
    }).catch(() => {});
    return product;
  }

  async remove(id: number, userId?: number) {
    const [reqItems, poItems] = await Promise.all([
      this.prisma.requisitionItem.count({ where: { productId: id } }),
      this.prisma.purchaseOrderItem.count({ where: { productId: id } }),
    ]);
    if (reqItems > 0 || poItems > 0) {
      return this.archive(id, userId);
    }
    const product = await this.prisma.product.update({ where: { id }, data: { isActive: false } });
    this.audit.create({
      userId,
      action: 'DELETE',
      entity: 'product',
      entityId: String(id),
    }).catch(() => {});
    return product;
  }

  async duplicate(id: number, userId?: number) {
    const original = await this.prisma.product.findUnique({ where: { id } });
    if (!original) throw new NotFoundException('Product not found');
    const newSku = await this.generateSku(original.categoryId);
    const { id: _, createdAt, updatedAt, ...data } = original;
    const product = await this.prisma.product.create({
      data: { ...data, sku: newSku, name: `${data.name} (Copy)`, nameAr: `${data.nameAr} (نسخة)` },
      include: { category: true, unit: true },
    });
    this.audit.create({
      userId,
      action: 'DUPLICATE',
      entity: 'product',
      entityId: String(product.id),
      newValues: { sourceId: id, newSku: product.sku },
    }).catch(() => {});
    return product;
  }

  async updateImage(id: number, imageUrl: string, userId?: number) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    const imageUrls = [...(product.imageUrls || []), imageUrl];
    const updated = await this.prisma.product.update({
      where: { id },
      data: { imageUrl, imageUrls },
    });
    this.audit.create({
      userId, action: 'UPDATE', entity: 'product', entityId: String(id), newValues: { imageUrl },
    }).catch(() => {});
    return updated;
  }

  /** Remove a specific image URL from the product's imageUrls array */
  async deleteImage(id: number, imageUrl: string, userId?: number) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    const imageUrls = (product.imageUrls || []).filter((u) => u !== imageUrl);
    const newPrimary = imageUrls[0] ?? null;
    const updated = await this.prisma.product.update({
      where: { id },
      data: { imageUrls, imageUrl: newPrimary },
    });
    this.audit.create({
      userId, action: 'UPDATE', entity: 'product', entityId: String(id), newValues: { deletedImage: imageUrl },
    }).catch(() => {});
    return updated;
  }

  async exportAll(categoryId?: number) {
    return this.prisma.product.findMany({
      where: {
        isActive: true,
        isArchived: false,
        ...(categoryId && { categoryId }),
      },
      include: {
        category: { select: { name: true, nameAr: true } },
        unit: { select: { name: true, abbreviation: true } },
        supplier: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async bulkImport(products: any[], userId?: number) {
    let created = 0;
    for (const p of products) {
      if (!p.sku) p.sku = await this.generateSku(p.categoryId);
      try {
        await this.prisma.product.create({ data: p });
        created++;
      } catch {
        // Skip duplicates
      }
    }
    this.audit.create({
      userId,
      action: 'BULK_IMPORT',
      entity: 'product',
      newValues: { imported: created, total: products.length },
    }).catch(() => {});
    return { imported: created, total: products.length };
  }

  private async generateSku(categoryId?: number): Promise<string> {
    let prefix = 'GEN';
    if (categoryId) {
      const cat = await this.prisma.category.findUnique({ where: { id: categoryId } });
      if (cat) prefix = cat.name.substring(0, 3).toUpperCase();
    }
    const count = await this.prisma.product.count();
    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
  }
}
