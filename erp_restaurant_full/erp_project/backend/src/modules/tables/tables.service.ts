import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReservationStatus, TableStatus } from '@prisma/client';

@Injectable()
export class TablesService {
  constructor(private prisma: PrismaService) {}

  // ---- Tables ----
  listTables(branchId?: number) {
    return this.prisma.restaurantTable.findMany({
      where: branchId ? { branchId } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  createTable(dto: { branchId: number; name: string; seats?: number }) {
    return this.prisma.restaurantTable.create({
      data: { branchId: dto.branchId, name: dto.name, seats: dto.seats ?? 2 },
    });
  }

  async updateTable(
    id: number,
    dto: { name?: string; seats?: number; status?: TableStatus; isActive?: boolean },
  ) {
    await this.getTable(id);
    return this.prisma.restaurantTable.update({ where: { id }, data: dto });
  }

  async getTable(id: number) {
    const t = await this.prisma.restaurantTable.findUnique({ where: { id } });
    if (!t) throw new NotFoundException(`Table ${id} not found`);
    return t;
  }

  async removeTable(id: number) {
    await this.getTable(id);
    return this.prisma.restaurantTable.update({ where: { id }, data: { isActive: false } });
  }

  // ---- Reservations ----
  listReservations(filters?: { branchId?: number; status?: ReservationStatus; date?: string }) {
    const where: any = {};
    if (filters?.branchId) where.branchId = filters.branchId;
    if (filters?.status) where.status = filters.status;
    if (filters?.date) {
      where.reservedAt = {
        gte: new Date(filters.date + 'T00:00:00.000Z'),
        lte: new Date(filters.date + 'T23:59:59.999Z'),
      };
    }
    return this.prisma.reservation.findMany({ where, orderBy: { reservedAt: 'asc' }, take: 200 });
  }

  createReservation(
    dto: {
      branchId: number;
      reservedAt: string;
      tableId?: number;
      customerId?: number;
      customerName?: string;
      phone?: string;
      partySize?: number;
      notes?: string;
    },
    userId?: number,
  ) {
    return this.prisma.reservation.create({
      data: {
        branchId: dto.branchId,
        reservedAt: new Date(dto.reservedAt),
        tableId: dto.tableId ?? null,
        customerId: dto.customerId ?? null,
        customerName: dto.customerName,
        phone: dto.phone,
        partySize: dto.partySize ?? 2,
        notes: dto.notes,
        createdById: userId ?? null,
      },
    });
  }

  async setReservationStatus(id: number, status: ReservationStatus) {
    const r = await this.prisma.reservation.findUnique({ where: { id } });
    if (!r) throw new NotFoundException(`Reservation ${id} not found`);
    // Reflect onto the table where it makes sense.
    if (r.tableId && (status === ReservationStatus.SEATED || status === ReservationStatus.BOOKED)) {
      await this.prisma.restaurantTable.update({
        where: { id: r.tableId },
        data: { status: status === ReservationStatus.SEATED ? TableStatus.OCCUPIED : TableStatus.RESERVED },
      });
    }
    if (r.tableId && (status === ReservationStatus.COMPLETED || status === ReservationStatus.CANCELLED || status === ReservationStatus.NO_SHOW)) {
      await this.prisma.restaurantTable.update({
        where: { id: r.tableId },
        data: { status: TableStatus.AVAILABLE },
      });
    }
    return this.prisma.reservation.update({ where: { id }, data: { status } });
  }
}
