import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { KDS_CHANGED } from './kds.gateway';
import { KdsStatus, OrderStatus } from '@prisma/client';

@Injectable()
export class KdsService {
  constructor(private prisma: PrismaService, private events: EventEmitter2) {}

  /** Live kitchen board: open line items grouped by KDS status for a branch. */
  async board(branchId?: number) {
    const items = await this.prisma.orderItem.findMany({
      where: {
        kdsStatus: { in: [KdsStatus.QUEUED, KdsStatus.PREPARING, KdsStatus.READY] },
        order: {
          status: { in: [OrderStatus.OPEN, OrderStatus.HELD, OrderStatus.COMPLETED] },
          ...(branchId ? { branchId } : {}),
        },
      },
      include: {
        product: { select: { id: true, sku: true, name: true, nameAr: true } },
        order: { select: { id: true, orderNo: true, channel: true, tableName: true, branchId: true, createdAt: true } },
      },
      orderBy: [{ order: { createdAt: 'asc' } }, { id: 'asc' }],
      take: 300,
    });

    const board: Record<string, typeof items> = {
      QUEUED: [],
      PREPARING: [],
      READY: [],
    };
    for (const it of items) board[it.kdsStatus]?.push(it);
    return board;
  }

  async advance(itemId: number, status: KdsStatus) {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { order: { select: { branchId: true } } },
    });
    if (!item) throw new NotFoundException(`Order item ${itemId} not found`);
    const data: any = { kdsStatus: status };
    if (status === KdsStatus.PREPARING && !item.firedAt) data.firedAt = new Date();
    if (status === KdsStatus.READY && !item.readyAt) data.readyAt = new Date();
    const updated = await this.prisma.orderItem.update({ where: { id: itemId }, data });
    this.events.emit(KDS_CHANGED, { branchId: item.order.branchId });
    return updated;
  }

  /** Simple kitchen performance: avg prep time (firedAt -> readyAt) for a period. */
  async performance(branchId?: number, from?: string, to?: string) {
    const items = await this.prisma.orderItem.findMany({
      where: {
        firedAt: { not: null },
        readyAt: { not: null },
        order: {
          ...(branchId ? { branchId } : {}),
          ...(from || to
            ? {
                createdAt: {
                  ...(from ? { gte: new Date(from) } : {}),
                  ...(to ? { lte: new Date(to + 'T23:59:59.999Z') } : {}),
                },
              }
            : {}),
        },
      },
      select: { firedAt: true, readyAt: true },
      take: 1000,
    });
    if (!items.length) return { count: 0, avgPrepSeconds: 0 };
    const total = items.reduce(
      (s, i) => s + (i.readyAt!.getTime() - i.firedAt!.getTime()) / 1000,
      0,
    );
    return { count: items.length, avgPrepSeconds: Math.round(total / items.length) };
  }
}
