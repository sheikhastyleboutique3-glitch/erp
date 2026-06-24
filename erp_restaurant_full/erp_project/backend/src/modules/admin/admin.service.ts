import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private prisma: PrismaService) {}

  async getSystemStats() {
    const [users, branches, products, requisitions, inventory, wastage, alerts, purchaseOrders, transfers, batches] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.branch.count(),
      this.prisma.product.count(),
      this.prisma.requisition.count(),
      this.prisma.inventory.count(),
      this.prisma.wastageRecord.count(),
      this.prisma.alert.count({ where: { isResolved: false } }),
      this.prisma.purchaseOrder.count(),
      this.prisma.transferOrder.count(),
      this.prisma.batch.count(),
    ]);
    const byStatus = await this.prisma.requisition.groupBy({ by: ['status'], _count: true });
    return {
      counts: { users, branches, products, requisitions, inventory, wastage, alerts, purchaseOrders, transfers, batches },
      byStatus,
      timestamp: new Date().toISOString(),
    };
  }

  private async resetSequence(tableName: string): Promise<void> {
    try {
      const result = await this.prisma.$queryRawUnsafe<{ seq_name: string | null }[]>(
        `SELECT pg_get_serial_sequence('"${tableName}"', 'id') as seq_name`,
      );
      const seqName = result?.[0]?.seq_name;
      if (seqName) {
        // Align the sequence with the current MAX(id) so the next insert is
        // MAX(id)+1. When the table is empty this resets it to 1. This is
        // correct whether operational data was purged OR master data was kept
        // (a plain "RESTART WITH 1" collides with kept rows that still hold
        // ids 1..N).
        await this.prisma.$executeRawUnsafe(
          `SELECT setval(
             '${seqName}',
             COALESCE((SELECT MAX(id) FROM "${tableName}"), 1),
             (SELECT MAX(id) FROM "${tableName}") IS NOT NULL
           )`,
        );
        this.logger.log(`Sequence realigned for ${tableName}: ${seqName}`);
      }
    } catch (e) {
      this.logger.warn(`Could not reset sequence for ${tableName}: ${(e as Error).message}`);
    }
  }

  async resetSystem(userId: number, confirmPhrase: string, keepMasterData: boolean) {
    this.logger.log(`Reset system requested by user ${userId}, keepMasterData: ${keepMasterData}`);
    if (!confirmPhrase) throw new BadRequestException('Confirmation phrase is required');
    if (typeof keepMasterData !== 'boolean') throw new BadRequestException('keepMasterData must be a boolean');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');
    if (confirmPhrase !== 'PURGE-ALL-OPERATIONAL-DATA-TO-ZERO') {
      throw new BadRequestException('Wrong confirmation phrase. Required: "PURGE-ALL-OPERATIONAL-DATA-TO-ZERO"');
    }

    this.logger.log('Validation passed, starting data deletion...');
    await this.prisma.$transaction([
      this.prisma.auditLog.deleteMany(),
      this.prisma.alert.deleteMany(),
      this.prisma.wastageRecord.deleteMany(),
      this.prisma.inventoryTransaction.deleteMany(),
      this.prisma.inventory.deleteMany(),
      // Branch-to-branch transfers + FEFO batches (added with batch tracking).
      // Must be purged here: batches reference products with RESTRICT, so a
      // full wipe that deletes products would otherwise fail.
      this.prisma.transferOrderItem.deleteMany(),
      this.prisma.transferOrder.deleteMany(),
      this.prisma.batch.deleteMany(),
      this.prisma.requisitionDispatch.deleteMany(),
      this.prisma.requisitionStatusHistory.deleteMany(),
      this.prisma.requisitionItem.deleteMany(),
      this.prisma.requisition.deleteMany(),
      this.prisma.purchaseOrderItem.deleteMany(),
      this.prisma.purchaseOrder.deleteMany(),
      this.prisma.supplierPriceHistory.deleteMany(),
      this.prisma.userNotificationPreference.deleteMany(),
      this.prisma.notificationConfig.deleteMany(),
    ]);
    this.logger.log('Transactional data deleted');

    const transactionalTables = [
      'audit_logs', 'alerts', 'wastage_records', 'inventory_transactions',
      'inventory', 'transfer_order_items', 'transfer_orders', 'batches',
      'requisition_dispatches', 'requisition_status_history',
      'requisition_items', 'requisitions', 'purchase_order_items',
      'purchase_orders', 'supplier_price_history', 'user_notification_preferences',
      'notification_configs', 'system_reset_logs',
    ];
    for (const table of transactionalTables) await this.resetSequence(table);

    if (!keepMasterData) {
      this.logger.log('Deleting master data...');
      await this.prisma.$transaction([
        this.prisma.product.deleteMany(),
        this.prisma.category.deleteMany(),
        this.prisma.unit.deleteMany(),
        this.prisma.supplier.deleteMany(),
        this.prisma.user.deleteMany({ where: { role: { not: 'SUPER_ADMIN' } } }),
        this.prisma.userBranch.deleteMany({ where: { user: { role: { not: 'SUPER_ADMIN' } } } }),
      ]);
      const masterTables = ['products', 'categories', 'units', 'suppliers', 'user_branches'];
      for (const table of masterTables) await this.resetSequence(table);
      this.logger.log('Master data deleted');
    }

    try {
      await this.prisma.systemResetLog.create({
        data: { userId, resetType: keepMasterData ? 'TRANSACTION_WIPE' : 'FULL_WIPE', details: { timestamp: new Date().toISOString(), keepMasterData } },
      });
    } catch (e) {
      this.logger.warn('Could not log to SystemResetLog: ' + (e as Error).message);
    }

    return {
      success: true,
      message: keepMasterData
        ? 'Transactional data cleared. Master data preserved. All IDs reset to 1.'
        : 'Full wipe complete. Super Admin accounts retained. All IDs reset to 1.',
      action: keepMasterData ? 'TRANSACTION_WIPE' : 'FULL_WIPE',
    };
  }

  /**
   * Delete a single record by entity type + id.
   * Handles FK-safe cascading deletion for each type.
   */
  async deleteRecord(type: string, id: number, requestedByUserId: number) {
    this.logger.log(`Admin delete: type=${type} id=${id} by user=${requestedByUserId}`);

    switch (type) {
      case 'requisition': {
        const exists = await this.prisma.requisition.findUnique({ where: { id } });
        if (!exists) throw new NotFoundException(`Requisition #${id} not found`);
        // Delete in FK-safe order
        await this.prisma.$transaction([
          this.prisma.requisitionDispatch.deleteMany({ where: { requisitionId: id } }),
          this.prisma.requisitionStatusHistory.deleteMany({ where: { requisitionId: id } }),
          this.prisma.requisitionItem.deleteMany({ where: { requisitionId: id } }),
          this.prisma.requisition.delete({ where: { id } }),
        ]);
        return { success: true, message: `Requisition #${id} (${exists.requisitionNo}) deleted` };
      }

      case 'purchase-order': {
        const exists = await this.prisma.purchaseOrder.findUnique({ where: { id } });
        if (!exists) throw new NotFoundException(`Purchase Order #${id} not found`);
        await this.prisma.$transaction([
          this.prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } }),
          this.prisma.purchaseOrder.delete({ where: { id } }),
        ]);
        return { success: true, message: `Purchase Order #${id} (${exists.poNumber}) deleted` };
      }

      case 'wastage': {
        const exists = await this.prisma.wastageRecord.findUnique({ where: { id } });
        if (!exists) throw new NotFoundException(`Wastage record #${id} not found`);
        await this.prisma.wastageRecord.delete({ where: { id } });
        return { success: true, message: `Wastage record #${id} deleted` };
      }

      case 'alert': {
        const exists = await this.prisma.alert.findUnique({ where: { id } });
        if (!exists) throw new NotFoundException(`Alert #${id} not found`);
        await this.prisma.alert.delete({ where: { id } });
        return { success: true, message: `Alert #${id} deleted` };
      }

      case 'inventory': {
        const exists = await this.prisma.inventory.findUnique({ where: { id } });
        if (!exists) throw new NotFoundException(`Inventory record #${id} not found`);
        await this.prisma.$transaction([
          this.prisma.inventoryTransaction.deleteMany({ where: { productId: exists.productId, branchId: exists.branchId } }),
          this.prisma.inventory.delete({ where: { id } }),
        ]);
        return { success: true, message: `Inventory record #${id} deleted` };
      }

      case 'audit-log': {
        const exists = await this.prisma.auditLog.findUnique({ where: { id } });
        if (!exists) throw new NotFoundException(`Audit log #${id} not found`);
        await this.prisma.auditLog.delete({ where: { id } });
        return { success: true, message: `Audit log #${id} deleted` };
      }

      default:
        throw new BadRequestException(`Unknown record type: ${type}. Valid: requisition, purchase-order, wastage, alert, inventory, audit-log`);
    }
  }
}
