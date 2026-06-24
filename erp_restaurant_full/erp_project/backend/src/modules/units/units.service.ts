import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class UnitsService {
  constructor(private prisma: PrismaService) {}

  findAll() { return this.prisma.unit.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }); }

  create(dto: any) { return this.prisma.unit.create({ data: dto }); }

  update(id: number, dto: any) { return this.prisma.unit.update({ where: { id }, data: dto }); }

  remove(id: number) { return this.prisma.unit.update({ where: { id }, data: { isActive: false } }); }
}
