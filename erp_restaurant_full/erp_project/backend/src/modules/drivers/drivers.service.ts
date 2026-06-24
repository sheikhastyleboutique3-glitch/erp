import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class DriversService {
  constructor(private prisma: PrismaService) {}

  findAll(activeOnly = false) {
    return this.prisma.driver.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: number) {
    const d = await this.prisma.driver.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Driver not found');
    return d;
  }

  create(dto: any) {
    return this.prisma.driver.create({
      data: {
        name: dto.name,
        phone: dto.phone || null,
        licenseNo: dto.licenseNo || null,
        vehicle: dto.vehicle || null,
        notes: dto.notes || null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: number, dto: any) {
    await this.findOne(id);
    return this.prisma.driver.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.phone !== undefined && { phone: dto.phone || null }),
        ...(dto.licenseNo !== undefined && { licenseNo: dto.licenseNo || null }),
        ...(dto.vehicle !== undefined && { vehicle: dto.vehicle || null }),
        ...(dto.notes !== undefined && { notes: dto.notes || null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  /** Soft-delete (deactivate) so existing dispatch history keeps its reference. */
  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.driver.update({ where: { id }, data: { isActive: false } });
  }
}
