import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  async findOne(id: number) {
    const s = await this.prisma.supplier.findUnique({
      where: { id },
      include: { products: { where: { isActive: true } } },
    });
    if (!s) throw new NotFoundException('Supplier not found');
    return s;
  }

  create(dto: any) {
    return this.prisma.supplier.create({ data: dto });
  }

  update(id: number, dto: any) {
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  remove(id: number) {
    return this.prisma.supplier.update({ where: { id }, data: { isActive: false } });
  }

  async getPriceHistory(supplierId: number, productId?: number) {
    const where: any = { supplierId };
    if (productId) where.productId = productId;
    return this.prisma.supplierPriceHistory.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, nameAr: true, sku: true } },
        changedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
