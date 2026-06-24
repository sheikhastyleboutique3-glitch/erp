import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface OptionInput {
  id?: number;
  name: string;
  nameAr?: string;
  priceDelta?: number;
  componentProductId?: number | null;
  qtyToDeduct?: number;
  sortOrder?: number;
}
export interface GroupInput {
  name: string;
  nameAr?: string;
  minSelect?: number;
  maxSelect?: number;
  required?: boolean;
  options?: OptionInput[];
}

@Injectable()
export class ModifiersService {
  constructor(private prisma: PrismaService) {}

  listGroups() {
    return this.prisma.modifierGroup.findMany({
      orderBy: { name: 'asc' },
      include: { options: { orderBy: { sortOrder: 'asc' } }, productLinks: true },
    });
  }

  /** Modifier groups (with options) attached to a product, ordered. */
  async forProduct(productId: number) {
    const links = await this.prisma.productModifierGroup.findMany({
      where: { productId },
      orderBy: { sortOrder: 'asc' },
      include: { group: { include: { options: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } } } },
    });
    return links.filter((l) => l.group.isActive).map((l) => l.group);
  }

  async createGroup(dto: GroupInput) {
    return this.prisma.modifierGroup.create({
      data: {
        name: dto.name,
        nameAr: dto.nameAr,
        minSelect: dto.minSelect ?? 0,
        maxSelect: dto.maxSelect ?? 1,
        required: dto.required ?? false,
        options: {
          create: (dto.options ?? []).map((o, i) => ({
            name: o.name,
            nameAr: o.nameAr,
            priceDelta: o.priceDelta ?? 0,
            componentProductId: o.componentProductId ?? null,
            qtyToDeduct: o.qtyToDeduct ?? 0,
            sortOrder: o.sortOrder ?? i,
          })),
        },
      },
      include: { options: true },
    });
  }

  async updateGroup(id: number, dto: GroupInput) {
    const group = await this.prisma.modifierGroup.findUnique({ where: { id } });
    if (!group) throw new NotFoundException(`Group ${id} not found`);
    // Replace options wholesale for simplicity.
    return this.prisma.$transaction(async (tx) => {
      await tx.modifierGroup.update({
        where: { id },
        data: {
          name: dto.name,
          nameAr: dto.nameAr,
          minSelect: dto.minSelect ?? 0,
          maxSelect: dto.maxSelect ?? 1,
          required: dto.required ?? false,
        },
      });
      if (dto.options) {
        await tx.modifierOption.deleteMany({ where: { groupId: id } });
        await tx.modifierOption.createMany({
          data: dto.options.map((o, i) => ({
            groupId: id,
            name: o.name,
            nameAr: o.nameAr,
            priceDelta: o.priceDelta ?? 0,
            componentProductId: o.componentProductId ?? null,
            qtyToDeduct: o.qtyToDeduct ?? 0,
            sortOrder: o.sortOrder ?? i,
          })),
        });
      }
      return tx.modifierGroup.findUnique({ where: { id }, include: { options: true } });
    });
  }

  async removeGroup(id: number) {
    await this.prisma.modifierGroup.delete({ where: { id } });
    return { success: true };
  }

  /** Set the full list of group ids attached to a product. */
  async setProductGroups(productId: number, groupIds: number[]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.productModifierGroup.deleteMany({ where: { productId } });
      await tx.productModifierGroup.createMany({
        data: groupIds.map((groupId, i) => ({ productId, groupId, sortOrder: i })),
        skipDuplicates: true,
      });
      return this.forProduct(productId);
    });
  }
}
