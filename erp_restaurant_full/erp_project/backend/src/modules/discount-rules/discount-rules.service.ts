import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class DiscountRulesService {
  constructor(private prisma: PrismaService) {}

  findAll(activeOnly = false) {
    return this.prisma.discountRule.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: { name: 'asc' },
    });
  }

  create(dto: any) {
    return this.prisma.discountRule.create({ data: this.coerce(dto) });
  }

  update(id: number, dto: any) {
    return this.prisma.discountRule.update({ where: { id }, data: this.coerce(dto) });
  }

  remove(id: number) {
    return this.prisma.discountRule.update({ where: { id }, data: { isActive: false } });
  }

  /** Normalise optional date strings coming from the API into Date objects. */
  private coerce(dto: any) {
    const out: any = { ...dto };
    if (out.validFrom) out.validFrom = new Date(out.validFrom);
    if (out.validTo) out.validTo = new Date(out.validTo);
    return out;
  }
}
