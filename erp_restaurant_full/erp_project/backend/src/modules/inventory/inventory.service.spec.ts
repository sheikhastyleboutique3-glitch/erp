import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { InventoryTxType, Prisma } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Unit tests for the inventory stock-mutation engine: add/deduct/set math,
 * insufficient-stock guarding, row-locking transaction wrapper, and the
 * P2034 serialization retry.
 */
describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: any;
  let tx: any;

  const makeTx = (currentQty: number | null = 0) => ({
    $queryRaw: jest.fn().mockResolvedValue(currentQty == null ? [] : [{ id: 1, quantity: currentQty }]),
    inventory: {
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
      findMany: jest.fn().mockResolvedValue(
        currentQty == null ? [] : [{ id: 1, batchId: null, quantity: currentQty, expiryDate: null, batch: null }],
      ),
    },
    inventoryTransaction: { create: jest.fn().mockResolvedValue({}) },
    // Default product is NOT expiry-tracked, so manual adds route to the aggregate row.
    product: { findUnique: jest.fn().mockResolvedValue({ sku: 'X', tracksExpiry: false, expiryTrackingType: null, shelfLifeDays: null }) },
    batch: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  });

  beforeEach(async () => {
    tx = makeTx(10);
    prisma = {
      inventory: { findMany: jest.fn() },
      inventoryTransaction: { findMany: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [InventoryService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(InventoryService);
  });

  describe('applyAdjustment math', () => {
    it('ADDs to current quantity for RECEIPT', async () => {
      const t = makeTx(10);
      const res = await service.applyAdjustment(t as any, { productId: 1, branchId: 2, quantity: 5, type: InventoryTxType.RECEIPT });
      expect(res.balanceBefore).toBe(10);
      expect(res.balanceAfter).toBe(15);
      expect(t.inventory.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ quantity: 15 }) }));
      expect(t.inventoryTransaction.create).toHaveBeenCalledTimes(1);
    });

    it('DEDUCTs from current quantity for WASTAGE', async () => {
      const t = makeTx(10);
      const res = await service.applyAdjustment(t as any, { productId: 1, branchId: 2, quantity: 4, type: InventoryTxType.WASTAGE });
      expect(res.balanceAfter).toBe(6);
    });

    it('SETs absolute quantity for ADJUSTMENT (neither add nor deduct)', async () => {
      const t = makeTx(10);
      const res = await service.applyAdjustment(t as any, { productId: 1, branchId: 2, quantity: 3, type: InventoryTxType.ADJUSTMENT });
      expect(res.balanceAfter).toBe(3);
    });

    it('throws ConflictException when deducting more than available', async () => {
      const t = makeTx(2);
      await expect(
        service.applyAdjustment(t as any, { productId: 1, branchId: 2, quantity: 5, type: InventoryTxType.WASTAGE }),
      ).rejects.toThrow(ConflictException);
      expect(t.inventoryTransaction.create).not.toHaveBeenCalled();
    });

    it('treats a missing inventory row as quantity 0', async () => {
      const t = makeTx(null);
      const res = await service.applyAdjustment(t as any, { productId: 9, branchId: 2, quantity: 7, type: InventoryTxType.RECEIPT });
      expect(res.balanceBefore).toBe(0);
      expect(res.balanceAfter).toBe(7);
    });
  });

  describe('adjust (transaction wrapper)', () => {
    it('runs inside a Serializable transaction', async () => {
      await service.adjust({ productId: 1, branchId: 2, quantity: 5, type: InventoryTxType.RECEIPT });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const opts = prisma.$transaction.mock.calls[0][1];
      expect(opts.isolationLevel).toBe(Prisma.TransactionIsolationLevel.Serializable);
    });

    it('retries on P2034 write-conflict then succeeds', async () => {
      const err: any = new Error('write conflict');
      err.code = 'P2034';
      prisma.$transaction
        .mockRejectedValueOnce(err)
        .mockImplementationOnce((cb: any) => cb(makeTx(10)));
      const res = await service.adjust({ productId: 1, branchId: 2, quantity: 1, type: InventoryTxType.RECEIPT });
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(res.balanceAfter).toBe(11);
    });

    it('propagates non-retryable errors', async () => {
      prisma.$transaction.mockRejectedValue(new ConflictException('Insufficient stock'));
      await expect(
        service.adjust({ productId: 1, branchId: 2, quantity: 99, type: InventoryTxType.WASTAGE }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getLowStockAlerts', () => {
    it('returns only items at or below their product minStockLevel', async () => {
      prisma.inventory.findMany.mockResolvedValue([
        { quantity: 2, product: { minStockLevel: 5 }, branch: { id: 1, name: 'A' } },
        { quantity: 9, product: { minStockLevel: 5 }, branch: { id: 1, name: 'A' } },
        { quantity: 5, product: { minStockLevel: 5 }, branch: { id: 1, name: 'A' } },
      ]);
      const low = await service.getLowStockAlerts(1);
      expect(low).toHaveLength(2);
      expect(low.map((l: any) => l.quantity)).toEqual([2, 5]);
    });
  });
});
