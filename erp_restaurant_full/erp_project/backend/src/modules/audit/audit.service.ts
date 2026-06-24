import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  findAll(filters?: {
    entity?: string;
    action?: string;
    userId?: number;
    search?: string;
    from?: string;
    to?: string;
    limit?: number;
  }) {
    const where: any = {};
    if (filters?.entity) where.entity = filters.entity;
    if (filters?.action) where.action = filters.action;
    if (filters?.userId) where.userId = filters.userId;
    if (filters?.search) {
      where.OR = [
        { entityId: { contains: filters.search, mode: 'insensitive' } },
        { action: { contains: filters.search, mode: 'insensitive' } },
        { entity: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters?.from || filters?.to) {
      where.createdAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to + 'T23:59:59.999Z') } : {}),
      };
    }
    return this.prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 200,
    });
  }

  create(data: {
    userId?: number;
    action: string;
    entity: string;
    entityId?: string;
    oldValues?: any;
    newValues?: any;
    ipAddress?: string;
  }) {
    return this.prisma.auditLog.create({ data });
  }
}
