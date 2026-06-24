import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PosSessionStatus, OrderStatus } from '@prisma/client';

@Injectable()
export class PosSessionsService {
  constructor(private prisma: PrismaService) {}

  /** The single OPEN session for a branch, or null. */
  current(branchId: number) {
    return this.prisma.posSession.findFirst({
      where: { branchId, status: PosSessionStatus.OPEN },
      include: { movements: { orderBy: { createdAt: 'desc' } } },
    });
  }

  list(branchId?: number) {
    return this.prisma.posSession.findMany({
      where: branchId ? { branchId } : undefined,
      orderBy: { openedAt: 'desc' },
      take: 100,
    });
  }

  private async genNo(branchId: number) {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.prisma.posSession.count();
    return `POS-${stamp}-B${branchId}-${String(count + 1).padStart(4, '0')}`;
  }

  async open(branchId: number, openingFloat: number, userId?: number) {
    const existing = await this.current(branchId);
    if (existing) {
      throw new BadRequestException(`Branch already has an open session (${existing.sessionNo}). Close it first.`);
    }
    return this.prisma.posSession.create({
      data: {
        sessionNo: await this.genNo(branchId),
        branchId,
        openingFloat: openingFloat ?? 0,
        openedById: userId ?? null,
      },
    });
  }

  async addCashMovement(sessionId: number, type: 'CASH_IN' | 'CASH_OUT', amount: number, reason?: string, userId?: number) {
    const session = await this.prisma.posSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    if (session.status !== PosSessionStatus.OPEN) throw new BadRequestException('Session is closed.');
    if (!(amount > 0)) throw new BadRequestException('Amount must be positive.');
    await this.prisma.posCashMovement.create({
      data: { sessionId, type, amount, reason, createdById: userId ?? null },
    });
    return this.report(sessionId);
  }

  /** Aggregate a session into a Z/X report. */
  async report(sessionId: number) {
    const session = await this.prisma.posSession.findUnique({
      where: { id: sessionId },
      include: { movements: true },
    });
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);

    const orders = await this.prisma.order.findMany({
      where: { sessionId, status: OrderStatus.COMPLETED },
      include: { payments: true },
    });

    const byMethod: Record<string, number> = {};
    let salesTotal = 0;
    let foodCost = 0;
    let grossProfit = 0;
    for (const o of orders) {
      salesTotal += o.total;
      foodCost += o.foodCost;
      grossProfit += o.grossProfit;
      for (const p of o.payments) {
        byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
      }
    }

    const cashIn = session.movements.filter((m) => m.type === 'CASH_IN').reduce((s, m) => s + m.amount, 0);
    const cashOut = session.movements.filter((m) => m.type === 'CASH_OUT').reduce((s, m) => s + m.amount, 0);
    const cashSales = byMethod['CASH'] ?? 0;
    const expectedCash = session.openingFloat + cashSales + cashIn - cashOut;
    const cashDifference = session.closingCounted != null ? +(session.closingCounted - expectedCash).toFixed(2) : null;

    return {
      session,
      orderCount: orders.length,
      salesTotal: +salesTotal.toFixed(2),
      foodCost: +foodCost.toFixed(2),
      grossProfit: +grossProfit.toFixed(2),
      paymentsByMethod: byMethod,
      cashIn,
      cashOut,
      cashSales,
      expectedCash: +expectedCash.toFixed(2),
      closingCounted: session.closingCounted,
      cashDifference,
    };
  }

  async close(sessionId: number, closingCounted: number, userId?: number) {
    const session = await this.prisma.posSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    if (session.status !== PosSessionStatus.OPEN) throw new BadRequestException('Session is already closed.');
    await this.prisma.posSession.update({
      where: { id: sessionId },
      data: {
        status: PosSessionStatus.CLOSED,
        closingCounted: closingCounted ?? 0,
        closedById: userId ?? null,
        closedAt: new Date(),
      },
    });
    return this.report(sessionId);
  }

  /** Used by the sales engine to stamp completed orders with the open session. */
  async currentSessionId(branchId: number): Promise<number | null> {
    const s = await this.prisma.posSession.findFirst({
      where: { branchId, status: PosSessionStatus.OPEN },
      select: { id: true },
    });
    return s?.id ?? null;
  }
}
