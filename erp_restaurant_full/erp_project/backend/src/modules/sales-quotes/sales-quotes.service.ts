import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import { OrderChannel, SalesQuoteStatus } from '@prisma/client';

export interface QuoteItemInput {
  productId: number;
  quantity: number;
  unitPrice: number;
}
export interface CreateQuoteInput {
  branchId: number;
  customerId?: number;
  notes?: string;
  validUntil?: string;
  items: QuoteItemInput[];
}

@Injectable()
export class SalesQuotesService {
  constructor(private prisma: PrismaService, private sales: SalesService) {}

  private totals(items: QuoteItemInput[]) {
    const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    return { subtotal, total: subtotal };
  }

  private async genNo(branchId: number) {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.prisma.salesQuote.count();
    return `SQ-${stamp}-B${branchId}-${String(count + 1).padStart(4, '0')}`;
  }

  list(filters: { branchId?: number; status?: SalesQuoteStatus }) {
    return this.prisma.salesQuote.findMany({
      where: {
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async get(id: number) {
    const q = await this.prisma.salesQuote.findUnique({ where: { id }, include: { items: true } });
    if (!q) throw new NotFoundException(`Quote ${id} not found`);
    return q;
  }

  async create(dto: CreateQuoteInput, userId?: number) {
    if (!dto.items?.length) throw new BadRequestException('A quote needs at least one line.');
    const t = this.totals(dto.items);
    return this.prisma.salesQuote.create({
      data: {
        quoteNo: await this.genNo(dto.branchId),
        branchId: dto.branchId,
        customerId: dto.customerId ?? null,
        notes: dto.notes,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        createdById: userId ?? null,
        ...t,
        items: {
          create: dto.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            lineTotal: i.quantity * i.unitPrice,
          })),
        },
      },
      include: { items: true },
    });
  }

  private async assertDraft(id: number) {
    const q = await this.get(id);
    if (q.status !== SalesQuoteStatus.DRAFT) {
      throw new BadRequestException(`Quote ${q.quoteNo} is ${q.status}; only DRAFT quotes can be edited.`);
    }
    return q;
  }

  async update(id: number, dto: Partial<CreateQuoteInput>) {
    await this.assertDraft(id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.salesQuoteItem.deleteMany({ where: { quoteId: id } });
        await tx.salesQuoteItem.createMany({
          data: dto.items.map((i) => ({ quoteId: id, productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.quantity * i.unitPrice })),
        });
      }
      const items = await tx.salesQuoteItem.findMany({ where: { quoteId: id } });
      const t = this.totals(items);
      return tx.salesQuote.update({
        where: { id },
        data: {
          customerId: dto.customerId,
          notes: dto.notes,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
          ...t,
        },
        include: { items: true },
      });
    });
  }

  async confirm(id: number) {
    await this.assertDraft(id);
    return this.prisma.salesQuote.update({ where: { id }, data: { status: SalesQuoteStatus.CONFIRMED }, include: { items: true } });
  }

  async cancel(id: number) {
    const q = await this.get(id);
    if (q.status === SalesQuoteStatus.FULFILLED) throw new BadRequestException('Fulfilled quotes cannot be cancelled.');
    return this.prisma.salesQuote.update({ where: { id }, data: { status: SalesQuoteStatus.CANCELLED }, include: { items: true } });
  }

  /**
   * Fulfill a confirmed quote: realize it as a POS order and complete it
   * (allowUnpaid = invoice on account), so the existing FEFO inventory, COGS
   * and finance engine all run. Stores the resulting orderId on the quote.
   */
  async fulfill(id: number, userId?: number) {
    const q = await this.get(id);
    if (q.status !== SalesQuoteStatus.CONFIRMED) {
      throw new BadRequestException('Only CONFIRMED quotes can be fulfilled.');
    }
    const order = await this.sales.create(
      {
        branchId: q.branchId,
        channel: OrderChannel.DELIVERY,
        customerId: q.customerId ?? undefined,
        notes: `Sales order ${q.quoteNo}`,
        items: q.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
      },
      userId,
    );
    const completed = await this.sales.complete(order.id, { allowUnpaid: true }, userId);
    return this.prisma.salesQuote.update({
      where: { id },
      data: { status: SalesQuoteStatus.FULFILLED, orderId: completed.id },
      include: { items: true },
    });
  }
}
