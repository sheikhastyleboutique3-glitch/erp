import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FinanceEntryType, Prisma } from '@prisma/client';

export interface FinanceEntryInput {
  type: FinanceEntryType;
  amount: number;
  currency?: string;
  branchId?: number;
  sourceType?: string;
  sourceId?: number;
  reference?: string;
  notes?: string;
  createdById?: number;
  occurredAt?: Date;
}

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  /** Append a single finance entry. `amount` is signed (revenue +, cost -). */
  create(input: FinanceEntryInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.financeEntry.create({
      data: {
        type: input.type,
        amount: input.amount,
        currency: input.currency ?? 'QAR',
        branchId: input.branchId ?? null,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        reference: input.reference,
        notes: input.notes,
        createdById: input.createdById ?? null,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
  }

  createMany(inputs: FinanceEntryInput[], tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.financeEntry.createMany({
      data: inputs.map((i) => ({
        type: i.type,
        amount: i.amount,
        currency: i.currency ?? 'QAR',
        branchId: i.branchId ?? null,
        sourceType: i.sourceType,
        sourceId: i.sourceId,
        reference: i.reference,
        notes: i.notes,
        createdById: i.createdById ?? null,
        occurredAt: i.occurredAt ?? new Date(),
      })),
    });
  }

  /** Convenience: post the full set of journal lines for a completed sale. */
  recordSale(
    args: {
      orderId: number;
      orderNo: string;
      branchId: number;
      currency?: string;
      revenue: number; // subtotal - discount (net of tax/service/tip)
      tax: number;
      serviceCharge: number;
      tip: number;
      cogs: number;
      createdById?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const base = {
      currency: args.currency,
      branchId: args.branchId,
      sourceType: 'order',
      sourceId: args.orderId,
      reference: args.orderNo,
      createdById: args.createdById,
    };
    const lines: FinanceEntryInput[] = [
      { ...base, type: FinanceEntryType.SALE_REVENUE, amount: args.revenue },
      { ...base, type: FinanceEntryType.COGS, amount: -Math.abs(args.cogs) },
    ];
    if (args.tax) lines.push({ ...base, type: FinanceEntryType.TAX, amount: args.tax });
    if (args.serviceCharge)
      lines.push({ ...base, type: FinanceEntryType.SERVICE_CHARGE, amount: args.serviceCharge });
    if (args.tip) lines.push({ ...base, type: FinanceEntryType.TIP, amount: args.tip });
    return this.createMany(lines, tx);
  }

  findAll(filters?: { branchId?: number; type?: FinanceEntryType; from?: string; to?: string }) {
    const where: Prisma.FinanceEntryWhereInput = {};
    if (filters?.branchId) where.branchId = filters.branchId;
    if (filters?.type) where.type = filters.type;
    if (filters?.from || filters?.to) {
      where.occurredAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to + 'T23:59:59.999Z') } : {}),
      };
    }
    return this.prisma.financeEntry.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: 500,
    });
  }

  /** Net totals grouped by entry type for a period. */
  async summary(filters?: { branchId?: number; from?: string; to?: string }) {
    const where: Prisma.FinanceEntryWhereInput = {};
    if (filters?.branchId) where.branchId = filters.branchId;
    if (filters?.from || filters?.to) {
      where.occurredAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to + 'T23:59:59.999Z') } : {}),
      };
    }
    const grouped = await this.prisma.financeEntry.groupBy({
      by: ['type'],
      where,
      _sum: { amount: true },
    });
    const byType: Record<string, number> = {};
    for (const g of grouped) byType[g.type] = g._sum.amount ?? 0;
    const revenue = byType[FinanceEntryType.SALE_REVENUE] ?? 0;
    const cogs = byType[FinanceEntryType.COGS] ?? 0; // already negative
    return {
      byType,
      revenue,
      cogs: Math.abs(cogs),
      grossProfit: revenue + cogs,
      foodCostPct: revenue ? (Math.abs(cogs) / revenue) * 100 : 0,
      net: Object.values(byType).reduce((s, v) => s + v, 0),
    };
  }
}
