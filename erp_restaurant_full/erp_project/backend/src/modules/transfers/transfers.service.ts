import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryTxType, Prisma, TransferStatus } from '@prisma/client';

export interface CreateTransferDto {
  fromBranchId: number;
  toBranchId: number;
  notes?: string;
  items: { productId: number; quantity: number }[];
}

@Injectable()
export class TransfersService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
  ) {}

  /**
   * Run a unit of work inside a single Serializable transaction, retrying on
   * write-conflict (P2034) so concurrent transfers can never double-count stock.
   */
  private async runSerializable<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    retries = 3,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15_000,
      });
    } catch (err: any) {
      if (err?.code === 'P2034' && retries > 0) {
        await new Promise((r) => setTimeout(r, (4 - retries) * 100));
        return this.runSerializable(fn, retries - 1);
      }
      throw err;
    }
  }

  private async generateTransferNo(tx: Prisma.TransactionClient): Promise<string> {
    const count = await tx.transferOrder.count();
    return `TO-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
  }

  findAll(filters: { branchId?: number; status?: TransferStatus; direction?: 'in' | 'out' } = {}) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.branchId) {
      if (filters.direction === 'in') where.toBranchId = filters.branchId;
      else if (filters.direction === 'out') where.fromBranchId = filters.branchId;
      else where.OR = [{ fromBranchId: filters.branchId }, { toBranchId: filters.branchId }];
    }
    return this.prisma.transferOrder.findMany({
      where,
      include: {
        fromBranch: { select: { id: true, name: true, nameAr: true } },
        toBranch: { select: { id: true, name: true, nameAr: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, nameAr: true, sku: true } },
            batch: { select: { id: true, batchNumber: true, expiryDate: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const t = await this.prisma.transferOrder.findUnique({
      where: { id },
      include: {
        fromBranch: { select: { id: true, name: true, nameAr: true } },
        toBranch: { select: { id: true, name: true, nameAr: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        receivedBy: { select: { id: true, firstName: true, lastName: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, nameAr: true, sku: true } },
            batch: { select: { id: true, batchNumber: true, expiryDate: true } },
          },
        },
      },
    });
    if (!t) throw new NotFoundException('Transfer order not found');
    return t;
  }

  /**
   * Preview the FEFO batch allocation for a single product line WITHOUT moving
   * stock. Used by the UI to show which expiry dates will be transferred.
   */
  async previewFefo(fromBranchId: number, productId: number, quantity: number) {
    return this.prisma.$transaction((tx) =>
      this.inventory.planFefoAllocation(tx, productId, fromBranchId, quantity),
    );
  }

  /**
   * Step 1 (Initiation) + Step 2 (FEFO Batch Selection) + Step 3 (In-Transit).
   * Atomically: selects oldest-expiry batches first, deducts them from the
   * origin branch (TRANSFER_OUT), and creates the TransferOrder in IN_TRANSIT.
   * Destination stock is NOT touched yet.
   */
  async create(dto: CreateTransferDto, userId: number) {
    if (dto.fromBranchId === dto.toBranchId) {
      throw new BadRequestException('Origin and destination branches must differ');
    }
    if (!dto.items?.length) throw new BadRequestException('No items to transfer');

    const [fromBranch, toBranch] = await Promise.all([
      this.prisma.branch.findUnique({ where: { id: dto.fromBranchId } }),
      this.prisma.branch.findUnique({ where: { id: dto.toBranchId } }),
    ]);
    if (!fromBranch) throw new NotFoundException('Origin branch not found');
    if (!toBranch) throw new NotFoundException('Destination branch not found');

    return this.runSerializable(async (tx) => {
      const transferNo = await this.generateTransferNo(tx);
      const transfer = await tx.transferOrder.create({
        data: {
          transferNo,
          fromBranchId: dto.fromBranchId,
          toBranchId: dto.toBranchId,
          status: TransferStatus.IN_TRANSIT,
          notes: dto.notes,
          createdById: userId,
          dispatchedAt: new Date(),
        },
      });

      for (const line of dto.items) {
        const qty = Number(line.quantity);
        if (!qty || qty <= 0) continue;

        // FEFO: oldest-expiry batches first.
        const allocations = await this.inventory.planFefoAllocation(
          tx,
          line.productId,
          dto.fromBranchId,
          qty,
        );

        for (const alloc of allocations) {
          // Deduct from origin and hold in-transit.
          await this.inventory.applyAdjustment(tx, {
            productId: line.productId,
            branchId: dto.fromBranchId,
            quantity: alloc.quantity,
            type: InventoryTxType.TRANSFER_OUT,
            batchId: alloc.batchId,
            notes: `Transfer ${transferNo} -> ${toBranch.name}`,
            performedById: userId,
          });

          await tx.transferOrderItem.create({
            data: {
              transferOrderId: transfer.id,
              productId: line.productId,
              batchId: alloc.batchId,
              quantity: alloc.quantity,
              expiryDate: alloc.expiryDate,
            },
          });
        }
      }

      return this.findOneTx(tx, transfer.id);
    });
  }

  private async findOneTx(tx: Prisma.TransactionClient, id: number) {
    return tx.transferOrder.findUnique({
      where: { id },
      include: { items: { include: { product: true, batch: true } } },
    });
  }

  /**
   * Step 4 (Receipt Confirmation). Destination branch approves & receives.
   * Atomically adds each in-transit batch into destination stock, RETAINING the
   * original batch expiry dates, then flips the order to RECEIVED.
   */
  async confirmReceive(id: number, userId: number) {
    const transfer = await this.prisma.transferOrder.findUnique({
      where: { id },
      include: { items: { include: { batch: true } }, toBranch: true },
    });
    if (!transfer) throw new NotFoundException('Transfer order not found');
    if (transfer.status !== TransferStatus.IN_TRANSIT) {
      throw new BadRequestException(`Transfer must be IN_TRANSIT to receive (current: ${transfer.status})`);
    }

    return this.runSerializable(async (tx) => {
      for (const item of transfer.items) {
        await this.inventory.applyAdjustment(tx, {
          productId: item.productId,
          branchId: transfer.toBranchId,
          quantity: item.quantity,
          type: InventoryTxType.TRANSFER_IN,
          batchId: item.batchId,
          // Retain the original batch expiry on the destination stock row.
          expiryDate: (item.expiryDate ?? item.batch?.expiryDate)?.toISOString(),
          manufactureDate: item.batch?.manufactureDate?.toISOString(),
          batchNumber: item.batch?.batchNumber,
          notes: `Received transfer ${transfer.transferNo}`,
          performedById: userId,
        });
      }
      return tx.transferOrder.update({
        where: { id },
        data: { status: TransferStatus.RECEIVED, receivedById: userId, receivedAt: new Date() },
        include: { items: true },
      });
    });
  }

  /**
   * Cancel an in-transit transfer and return the held stock to the origin branch.
   */
  async cancel(id: number, userId: number) {
    const transfer = await this.prisma.transferOrder.findUnique({
      where: { id },
      include: { items: { include: { batch: true } } },
    });
    if (!transfer) throw new NotFoundException('Transfer order not found');
    if (transfer.status !== TransferStatus.IN_TRANSIT) {
      throw new BadRequestException('Only in-transit transfers can be cancelled');
    }

    return this.runSerializable(async (tx) => {
      for (const item of transfer.items) {
        await this.inventory.applyAdjustment(tx, {
          productId: item.productId,
          branchId: transfer.fromBranchId,
          quantity: item.quantity,
          type: InventoryTxType.TRANSFER_IN,
          batchId: item.batchId,
          expiryDate: (item.expiryDate ?? item.batch?.expiryDate)?.toISOString(),
          batchNumber: item.batch?.batchNumber,
          notes: `Cancelled transfer ${transfer.transferNo} — returned to origin`,
          performedById: userId,
        });
      }
      return tx.transferOrder.update({
        where: { id },
        data: { status: TransferStatus.CANCELLED },
        include: { items: true },
      });
    });
  }
}
