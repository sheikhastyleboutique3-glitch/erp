import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface CreateCustomerInput {
  name: string;
  phone?: string;
  email?: string;
  group?: string;
  creditLimit?: number;
  birthday?: string;
  notes?: string;
}
export type UpdateCustomerInput = Partial<CreateCustomerInput> & { isActive?: boolean };

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  findAll(search?: string) {
    const where: Prisma.CustomerWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};
    return this.prisma.customer.findMany({ where, orderBy: { name: 'asc' }, take: 200 });
  }

  async findOne(id: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, orderNo: true, total: true, status: true, createdAt: true },
        },
      },
    });
    if (!customer) throw new NotFoundException(`Customer ${id} not found`);
    return customer;
  }

  create(dto: CreateCustomerInput) {
    return this.prisma.customer.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        group: dto.group,
        creditLimit: dto.creditLimit ?? 0,
        birthday: dto.birthday ? new Date(dto.birthday) : null,
        notes: dto.notes,
      },
    });
  }

  async update(id: number, dto: UpdateCustomerInput) {
    await this.findOne(id);
    return this.prisma.customer.update({
      where: { id },
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        group: dto.group,
        creditLimit: dto.creditLimit,
        birthday: dto.birthday ? new Date(dto.birthday) : undefined,
        notes: dto.notes,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    // Soft delete to preserve historical order links.
    return this.prisma.customer.update({ where: { id }, data: { isActive: false } });
  }

  /** Top up / deduct store credit and grant / adjust loyalty points (clamped at 0). */
  async adjustWallet(id: number, dto: { creditDelta?: number; pointsDelta?: number }) {
    const c = await this.prisma.customer.findUnique({ where: { id } });
    if (!c) throw new NotFoundException(`Customer ${id} not found`);
    const creditBalance = Math.max(0, +((c.creditBalance ?? 0) + (dto.creditDelta ?? 0)).toFixed(2));
    const loyaltyPoints = Math.max(0, Math.round((c.loyaltyPoints ?? 0) + (dto.pointsDelta ?? 0)));
    return this.prisma.customer.update({ where: { id }, data: { creditBalance, loyaltyPoints } });
  }
}
