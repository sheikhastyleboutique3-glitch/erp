import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/** A single KOT ticket destined for one printer / station. */
export interface KotTicket {
  station: string;
  printer: {
    id: number;
    name: string;
    connection: string;
    ipAddress: string | null;
    port: number | null;
    usbPort: string | null;
    widthMm: number;
  } | null;
  lines: Array<{ quantity: number; name: string; notes?: string | null; modifiers?: string[] }>;
  /** Plain-text body the on-prem ESC/POS agent can render / push to hardware. */
  text: string;
}

@Injectable()
export class PrintersService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.printer.findMany({ orderBy: { name: 'asc' } });
  }

  create(dto: any) {
    return this.prisma.printer.create({ data: dto });
  }

  update(id: number, dto: any) {
    return this.prisma.printer.update({ where: { id }, data: dto });
  }

  remove(id: number) {
    return this.prisma.printer.update({ where: { id }, data: { isActive: false } });
  }

  /** Fallback station name from a category when no explicit station is set. */
  private stationFromCategory(name?: string | null): string {
    const c = (name || '').toLowerCase();
    if (/pastry|bakery|dessert|cake|sweet|croissant|معجن|حلو|مخبوز|كيك/.test(c)) return 'PASTRY';
    if (/coffee|drink|beverage|juice|bar|tea|قهوة|مشروب|عصير|شاي/.test(c)) return 'BARISTA';
    return 'HOT KITCHEN';
  }

  /**
   * Build station-grouped kitchen tickets for an order. Each line is routed by
   * its category's printer (preferred) or station string. Returns one ticket
   * per destination with a ready-to-print text body. The actual byte push to
   * hardware is performed by an on-prem ESC/POS agent that consumes this output
   * (kept out of the API so cloud deployments never block on local printers).
   */
  async buildKot(orderId: number): Promise<{ orderNo: string; tickets: KotTicket[] }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: {
              select: {
                name: true,
                category: {
                  select: {
                    name: true,
                    station: true,
                    printer: {
                      select: { id: true, name: true, connection: true, ipAddress: true, port: true, usbPort: true, widthMm: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    // Group lines by a routing key (printer id if present, else station name).
    const groups = new Map<string, KotTicket>();
    for (const it of order.items) {
      const cat = it.product?.category;
      const printer = cat?.printer ?? null;
      const station = (cat?.station && cat.station.trim()) || this.stationFromCategory(cat?.name);
      const key = printer ? `p${printer.id}` : `s${station}`;

      if (!groups.has(key)) {
        groups.set(key, { station, printer, lines: [], text: '' });
      }
      const mods = Array.isArray(it.modifiers) ? (it.modifiers as any[]) : [];
      groups.get(key)!.lines.push({
        quantity: it.quantity,
        name: it.product?.name ?? `#${it.productId}`,
        notes: it.notes,
        modifiers: mods.map((m) => m?.name).filter(Boolean),
      });
    }

    const when = new Date(order.createdAt).toLocaleString();
    const tickets = [...groups.values()].map((tk) => {
      const header = [
        `*** ${tk.station} ***`,
        `Order: ${order.orderNo}`,
        order.tableName ? `Table: ${order.tableName}` : `Channel: ${order.channel}`,
        when,
        '--------------------------------',
      ];
      const body = tk.lines.map((l) => {
        const base = `${l.quantity} x ${l.name}`;
        const extra = l.modifiers?.length ? `\n    + ${l.modifiers.join(', ')}` : '';
        const note = l.notes ? `\n    * ${l.notes}` : '';
        return base + extra + note;
      });
      tk.text = [...header, ...body, '--------------------------------'].join('\n');
      return tk;
    });

    return { orderNo: order.orderNo, tickets };
  }
}
