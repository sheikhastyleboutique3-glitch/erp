import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DeliveryStatus } from '@prisma/client';

@Injectable()
export class DeliveriesService {
  constructor(private prisma: PrismaService) {}

  private async withOrder(deliveries: any[]) {
    const orderIds = deliveries.map((d) => d.orderId);
    const orders = await this.prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, orderNo: true, total: true, status: true, customerId: true, tableName: true },
    });
    const byId = new Map(orders.map((o) => [o.id, o]));
    return deliveries.map((d) => ({ ...d, order: byId.get(d.orderId) ?? null }));
  }

  async list(filters: { branchId?: number; driverId?: number; status?: DeliveryStatus }) {
    const rows = await this.prisma.orderDelivery.findMany({
      where: {
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(filters.driverId ? { driverId: filters.driverId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return this.withOrder(rows);
  }

  /** A driver's active runs (assigned / out for delivery). */
  mine(driverId: number) {
    return this.list({ driverId }).then((rows) =>
      rows.filter((d) => d.status === DeliveryStatus.ASSIGNED || d.status === DeliveryStatus.OUT_FOR_DELIVERY),
    );
  }

  /** Create or update the manifest for an order (manager assigns a driver). */
  async assign(orderId: number, driverId: number | null, extra?: { address?: string; phone?: string; notes?: string }) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    const status = driverId ? DeliveryStatus.ASSIGNED : DeliveryStatus.PENDING;
    return this.prisma.orderDelivery.upsert({
      where: { orderId },
      create: {
        orderId,
        branchId: order.branchId,
        driverId,
        status,
        address: extra?.address,
        phone: extra?.phone,
        notes: extra?.notes,
        assignedAt: driverId ? new Date() : null,
      },
      update: {
        driverId,
        status,
        ...(extra?.address !== undefined ? { address: extra.address } : {}),
        ...(extra?.phone !== undefined ? { phone: extra.phone } : {}),
        ...(extra?.notes !== undefined ? { notes: extra.notes } : {}),
        assignedAt: driverId ? new Date() : null,
      },
    });
  }

  async setStatus(id: number, status: DeliveryStatus, driverId?: number) {
    const d = await this.prisma.orderDelivery.findUnique({ where: { id } });
    if (!d) throw new NotFoundException(`Delivery ${id} not found`);
    // A driver may only progress their own runs.
    if (driverId && d.driverId && d.driverId !== driverId) {
      throw new BadRequestException('This delivery is assigned to another driver.');
    }
    const data: any = { status };
    if (status === DeliveryStatus.OUT_FOR_DELIVERY && !d.dispatchedAt) data.dispatchedAt = new Date();
    if (status === DeliveryStatus.DELIVERED && !d.deliveredAt) data.deliveredAt = new Date();
    return this.prisma.orderDelivery.update({ where: { id }, data });
  }
}
