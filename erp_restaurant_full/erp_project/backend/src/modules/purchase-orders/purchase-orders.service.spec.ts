import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PurchaseOrderStatus, InventoryTxType } from '@prisma/client';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Unit tests for purchase orders, focused on the transactional receive flows
 * introduced by the atomicity refactor (updateStatus -> FULLY_RECEIVED and the
 * partial receive() path), plus guard conditions.
 */
describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService;
  let prisma: any;
  let inventory: { applyAdjustment: jest.Mock; adjust: jest.Mock };
  let tx: any;

  const makeTx = () => ({
    purchaseOrderItem: { update: jest.fn().mockResolvedValue({}) },
    supplierPriceHistory: { create: jest.fn().mockResolvedValue({}) },
    product: { update: jest.fn().mockResolvedValue({}) },
    purchaseOrder: {
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, totalAmount: data.totalAmount ?? 0, ...data })),
      findUnique: jest.fn(),
    },
  });

  beforeEach(async () => {
    tx = makeTx();
    prisma = {
      _tx: tx,
      purchaseOrder: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn(), count: jest.fn(), findMany: jest.fn() },
      purchaseOrderItem: { update: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    inventory = { applyAdjustment: jest.fn().mockResolvedValue({}), adjust: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryService, useValue: inventory },
        { provide: NotificationsService, useValue: { emit: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();
    service = module.get(PurchaseOrdersService);
  });

  describe('updateStatus', () => {
    it('throws when the PO does not exist', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(null);
      await expect(service.updateStatus(1, PurchaseOrderStatus.SENT_TO_SUPPLIER, 9)).rejects.toThrow(NotFoundException);
    });

    it('does NOT touch stock for a non-receiving status change', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue({ id: 1, poNumber: 'PO-1', branchId: 2, items: [], createdById: 5 });
      await service.updateStatus(1, PurchaseOrderStatus.SENT_TO_SUPPLIER, 9);
      expect(inventory.applyAdjustment).not.toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('credits stock for every line atomically when FULLY_RECEIVED', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue({
        id: 1, poNumber: 'PO-1', branchId: 2, createdById: 5,
        items: [
          { id: 10, productId: 100, orderedQty: 4, expiryDate: null },
          { id: 11, productId: 101, orderedQty: 6, expiryDate: null },
        ],
      });
      await service.updateStatus(1, PurchaseOrderStatus.FULLY_RECEIVED, 9);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(inventory.applyAdjustment).toHaveBeenCalledTimes(2);
      // composed with the SAME tx client, NOT the self-retrying public adjust()
      expect(inventory.applyAdjustment).toHaveBeenCalledWith(prisma._tx, expect.objectContaining({ productId: 100, quantity: 4, type: InventoryTxType.RECEIPT }));
      expect(inventory.adjust).not.toHaveBeenCalled();
      expect(prisma._tx.purchaseOrderItem.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('receive', () => {
    const po = {
      id: 1, poNumber: 'PO-1', branchId: 2, supplierId: 7, createdById: 5, currency: 'QAR',
      status: PurchaseOrderStatus.SENT_TO_SUPPLIER,
      items: [
        { id: 10, productId: 100, orderedQty: 10, receivedQty: 0, unitPrice: 2, expiryDate: null, product: { costPrice: 2 } },
        { id: 11, productId: 101, orderedQty: 5, receivedQty: 0, unitPrice: 3, expiryDate: null, product: { costPrice: 3 } },
      ],
    };

    it('rejects receiving a fully-received or cancelled PO', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue({ ...po, status: PurchaseOrderStatus.FULLY_RECEIVED });
      await expect(service.receive(1, { items: [{ itemId: 10, receivedQty: 1 }] }, 9)).rejects.toThrow(BadRequestException);
    });

    it('rejects an empty receive payload', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(po);
      await expect(service.receive(1, { items: [] }, 9)).rejects.toThrow(BadRequestException);
    });

    it('partial receipt: credits only the delta and sets PARTIALLY_RECEIVED, atomically', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(po);
      // findOne (end of receive) + the in-tx fresh fetch both use findUnique;
      // tx.purchaseOrder.findUnique returns partial fulfilment, prisma.findUnique
      // (findOne) returns the final doc.
      tx.purchaseOrder.findUnique.mockResolvedValue({ items: [
        { orderedQty: 10, receivedQty: 4, unitPrice: 2 },
        { orderedQty: 5, receivedQty: 0, unitPrice: 3 },
      ] });
      prisma.purchaseOrder.findUnique
        .mockResolvedValueOnce(po) // initial load
        .mockResolvedValue({ id: 1, items: [], supplier: {}, branch: {} }); // findOne at the end

      await service.receive(1, { items: [{ itemId: 10, receivedQty: 4 }] }, 9);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // delta = 4 - 0 = 4 credited via the tx client
      expect(inventory.applyAdjustment).toHaveBeenCalledTimes(1);
      expect(inventory.applyAdjustment).toHaveBeenCalledWith(prisma._tx, expect.objectContaining({ productId: 100, quantity: 4 }));
      expect(inventory.adjust).not.toHaveBeenCalled();
      // status recomputed to PARTIALLY_RECEIVED
      const statusUpdate = prisma._tx.purchaseOrder.update.mock.calls.at(-1)[0];
      expect(statusUpdate.data.status).toBe(PurchaseOrderStatus.PARTIALLY_RECEIVED);
    });

    it('logs a supplier price change + rolls cost when price differs and updateCostPrice is set', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(po);
      tx.purchaseOrder.findUnique.mockResolvedValue({ items: [
        { orderedQty: 10, receivedQty: 10, unitPrice: 2.5 },
        { orderedQty: 5, receivedQty: 5, unitPrice: 3 },
      ] });
      prisma.purchaseOrder.findUnique
        .mockResolvedValueOnce(po)
        .mockResolvedValue({ id: 1, items: [], supplier: {}, branch: {} });

      await service.receive(1, { items: [
        { itemId: 10, receivedQty: 10, unitPrice: 2.5 },
        { itemId: 11, receivedQty: 5 },
      ], updateCostPrice: true }, 9);

      expect(prisma._tx.supplierPriceHistory.create).toHaveBeenCalledTimes(1);
      expect(prisma._tx.product.update).toHaveBeenCalledWith({ where: { id: 100 }, data: { costPrice: 2.5 } });
      const statusUpdate = prisma._tx.purchaseOrder.update.mock.calls.at(-1)[0];
      expect(statusUpdate.data.status).toBe(PurchaseOrderStatus.FULLY_RECEIVED);
    });
  });
});
