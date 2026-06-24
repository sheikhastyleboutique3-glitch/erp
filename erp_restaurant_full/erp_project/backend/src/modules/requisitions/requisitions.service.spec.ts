import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InventoryTxType, RequisitionStatus } from '@prisma/client';
import { RequisitionsService } from './requisitions.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Unit tests for the requisition state machine and the atomic receipt /
 * review / procurement flows introduced by the transactional refactor.
 */
describe('RequisitionsService', () => {
  let service: RequisitionsService;
  let prisma: any;
  let inventory: { applyAdjustment: jest.Mock; adjust: jest.Mock };

  // A fake transaction client whose methods we can assert against. When
  // prisma.$transaction(cb) is called we invoke cb(tx) so the unit-of-work runs
  // exactly as it would inside a real transaction.
  const makeTx = () => ({
    requisitionItem: { update: jest.fn().mockResolvedValue({}) },
    requisitionDispatch: { update: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({}) },
    requisition: { update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })) },
  });

  beforeEach(async () => {
    const tx = makeTx();
    prisma = {
      _tx: tx,
      requisition: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn(), count: jest.fn() },
      requisitionItem: { update: jest.fn() },
      requisitionDispatch: { update: jest.fn(), create: jest.fn() },
      driver: { findUnique: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    inventory = { applyAdjustment: jest.fn().mockResolvedValue({}), adjust: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequisitionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryService, useValue: inventory },
        { provide: AuditService, useValue: { create: jest.fn().mockResolvedValue({}) } },
        { provide: NotificationsService, useValue: { emit: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();

    service = module.get(RequisitionsService);
  });

  describe('managerReview', () => {
    it('throws when requisition does not exist', async () => {
      prisma.requisition.findUnique.mockResolvedValue(null);
      await expect(service.managerReview(1, 'approve', 9)).rejects.toThrow(NotFoundException);
    });

    it('rejects review unless status is SUBMITTED', async () => {
      prisma.requisition.findUnique.mockResolvedValue({ id: 1, status: RequisitionStatus.MANAGER_APPROVED });
      await expect(service.managerReview(1, 'approve', 9)).rejects.toThrow(BadRequestException);
    });

    it('applies item edits + status change inside a single transaction', async () => {
      prisma.requisition.findUnique.mockResolvedValue({ id: 1, status: RequisitionStatus.SUBMITTED, branchId: 2, createdById: 5, requisitionNo: 'REQ-1' });
      await service.managerReview(1, 'approve', 9, { items: [{ id: 10, approvedQty: 4 }] });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma._tx.requisitionItem.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { approvedQty: 4 } });
      expect(prisma._tx.requisition.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('procurementUpdate', () => {
    it('rejects an invalid status transition', async () => {
      prisma.requisition.findUnique.mockResolvedValue({ id: 1, status: RequisitionStatus.SUBMITTED, dispatch: null });
      await expect(
        service.procurementUpdate(1, RequisitionStatus.DISPATCHED_TO_BRANCH, 9),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a dispatch + status change atomically when dispatching', async () => {
      prisma.requisition.findUnique.mockResolvedValue({ id: 1, status: RequisitionStatus.RECEIVED_AT_WAREHOUSE, branchId: 2, createdById: 5, requisitionNo: 'REQ-1', dispatch: null });
      await service.procurementUpdate(1, RequisitionStatus.DISPATCHED_TO_BRANCH, 9, { recipientName: 'Sam' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma._tx.requisitionDispatch.create).toHaveBeenCalledTimes(1);
      expect(prisma._tx.requisition.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('confirmReceipt', () => {
    const dispatched = {
      id: 1,
      status: RequisitionStatus.DISPATCHED_TO_BRANCH,
      branchId: 2,
      createdById: 5,
      requisitionNo: 'REQ-1',
      dispatch: { requisitionId: 1 },
      items: [
        { id: 10, productId: 100, approvedQty: 3, requestedQty: 5 },
        { id: 11, productId: 101, approvedQty: null, requestedQty: 2 },
      ],
    };

    it('rejects confirmation unless status is DISPATCHED_TO_BRANCH', async () => {
      prisma.requisition.findUnique.mockResolvedValue({ ...dispatched, status: RequisitionStatus.SUBMITTED });
      await expect(service.confirmReceipt(1, 9, 2)).rejects.toThrow(BadRequestException);
    });

    it('forbids confirming for a different branch', async () => {
      prisma.requisition.findUnique.mockResolvedValue(dispatched);
      await expect(service.confirmReceipt(1, 9, 999)).rejects.toThrow(ForbiddenException);
    });

    it('moves stock for every item inside ONE transaction and sets CONFIRMED_RECEIPT', async () => {
      prisma.requisition.findUnique.mockResolvedValue(dispatched);
      await service.confirmReceipt(1, 9, 2);

      // single atomic unit of work
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // inventory adjusted once per item, using the SAME tx client (composable)
      expect(inventory.applyAdjustment).toHaveBeenCalledTimes(2);
      expect(inventory.applyAdjustment).toHaveBeenCalledWith(
        prisma._tx,
        expect.objectContaining({ productId: 100, quantity: 3, type: InventoryTxType.REQUISITION_FULFILLMENT, branchId: 2 }),
      );
      // falls back to requestedQty when approvedQty is null
      expect(inventory.applyAdjustment).toHaveBeenCalledWith(
        prisma._tx,
        expect.objectContaining({ productId: 101, quantity: 2 }),
      );
      // dispatch confirmed + final status transition via tx
      expect(prisma._tx.requisitionDispatch.update).toHaveBeenCalledTimes(1);
      const finalUpdate = prisma._tx.requisition.update.mock.calls.at(-1)[0];
      expect(finalUpdate.data.status).toBe(RequisitionStatus.CONFIRMED_RECEIPT);
      // the per-item stock move must NOT use the self-retrying public adjust()
      expect(inventory.adjust).not.toHaveBeenCalled();
    });
  });
});
