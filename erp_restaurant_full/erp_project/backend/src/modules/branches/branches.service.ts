import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.branch.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: number) {
    const b = await this.prisma.branch.findUnique({
      where: { id },
      include: { users: { select: { id: true, firstName: true, lastName: true, role: true } } },
    });
    if (!b) throw new NotFoundException('Branch not found');
    return b;
  }

  create(dto: any) { return this.prisma.branch.create({ data: dto }); }
  update(id: number, dto: any) { return this.prisma.branch.update({ where: { id }, data: dto }); }
  remove(id: number) { return this.prisma.branch.update({ where: { id }, data: { isActive: false } }); }
}
