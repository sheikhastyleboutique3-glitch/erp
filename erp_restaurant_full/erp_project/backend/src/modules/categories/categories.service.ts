import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}
  findAll() { return this.prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }); }
  async findOne(id: number) {
    const c = await this.prisma.category.findUnique({ where: { id }, include: { products: { where: { isActive: true } } } });
    if (!c) throw new NotFoundException('Category not found');
    return c;
  }
  create(dto: any) { return this.prisma.category.create({ data: dto }); }
  update(id: number, dto: any) { return this.prisma.category.update({ where: { id }, data: dto }); }
  remove(id: number) { return this.prisma.category.update({ where: { id }, data: { isActive: false } }); }
}
