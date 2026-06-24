import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InventoryTxType, Prisma, RequisitionStatus, Role } from '@prisma/client';

const ALLOWED_TRANSITIONS: Partial<Record<RequisitionStatus, RequisitionStatus[]>> = {
  [RequisitionStatus.SUBMITTED]: [RequisitionStatus.MANAGER_APPROVED, RequisitionStatus.MANAGER_MODIFIED, RequisitionStatus.MANAGER_CANCELLED],
  [RequisitionStatus.MANAGER_APPROVED]: [RequisitionStatus.ORDER_PLACED_WITH_SUPPLIER, RequisitionStatus.RECEIVED_AT_WAREHOUSE],
  [RequisitionStatus.MANAGER_MODIFIED]: [RequisitionStatus.ORDER_PLACED_WITH_SUPPLIER, RequisitionStatus.RECEIVED_AT_WAREHOUSE],
  [RequisitionStatus.ORDER_PLACED_WITH_SUPPLIER]: [RequisitionStatus.RECEIVED_AT_WAREHOUSE],
  [RequisitionStatus.RECEIVED_AT_WAREHOUSE]: [RequisitionStatus.DISPATCHED_TO_BRANCH],
  [RequisitionStatus.DISPATCHED_TO_BRANCH]: [RequisitionStatus.CONFIRMED_RECEIPT],
};

@Injectable()
export class RequisitionsService {
  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Run a unit of work inside a single Serializable transaction, retrying on
   * write-conflict (P2034) so concurrent requisition updates stay consistent
   * without surfacing transient serialization errors to the client.
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

  /**
   * Fire an in-app notification (sound + clickable popup) for a requisition
   * event to every user with permission, plus the requisition creator. Always
   * fire-and-forget so notification problems never break the requisition flow.
   */
  private notifyReq(
    eventType: string,
    req: { id: number; requisitionNo: string; branchId: number; createdById: number },
    actorId: number,
    text: { title: string; titleAr: string; message: string; messageAr: string },
  ): void {
    this.notifications
      .emit({
        eventType,
        entityType: 'requisition',
        entityId: req.id,
        link: `/requisitions/${req.id}`,
        title: text.title,
        titleAr: text.titleAr,
        message: text.message,
        messageAr: text.messageAr,
        branchId: req.branchId,
        actorId,
        creatorId: req.createdById,
      })
      .catch(() => {});
  }

  private async generateReqNo(): Promise<string> {
    const count = await this.prisma.requisition.count();
    const d = new Date();
    return `REQ-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-${String(count + 1).padStart(4, '0')}`;
  }

  async findAll(
    user: { sub: number; role: Role; branchId?: number; branchIds?: number[] },
    status?: RequisitionStatus,
    branchId?: number,
    filters?: { search?: string; priority?: string; department?: string; from?: string; to?: string },
  ) {
    const staffRoles: Role[] = [Role.KITCHEN, Role.BARISTA, Role.PASTRY, Role.CASHIER, Role.CLEANER];
    const where: Record<string, unknown> = {};
    if (staffRoles.includes(user.role)) {
      where.branchId = user.branchId;
      where.createdById = user.sub;
    } else if (user.role === Role.BRANCH_MANAGER) {
      if (user.branchIds?.length) { where.branchId = { in: user.branchIds }; }
      else { where.branchId = user.branchId; }
    } else if (branchId) { where.branchId = branchId; }
    if (status) where.status = status;
    if (filters?.priority) where.priority = filters.priority;
    if (filters?.department) where.department = { contains: filters.department, mode: 'insensitive' };
    if (filters?.search) {
      where.OR = [
        { requisitionNo: { contains: filters.search, mode: 'insensitive' } },
        { notes: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters?.from || filters?.to) {
      where.createdAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }
    return this.prisma.requisition.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, nameAr: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, role: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        processedBy: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { product: { select: { id: true, name: true, nameAr: true, sku: true, imageUrl: true } }, unit: { select: { id: true, name: true, abbreviation: true } } } },
        dispatch: true,
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      // Safety cap so large branches never load the entire table in one request.
      // (Full page/limit pagination is a planned follow-up.)
      take: 500,
    });
  }

  async findOne(id: number) {
    const req = await this.prisma.requisition.findUnique({
      where: { id },
      include: {
        branch: true,
        createdBy: { select: { id: true, firstName: true, lastName: true, role: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        processedBy: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { product: { include: { category: true, unit: true } }, unit: true } },
        statusHistory: { orderBy: { createdAt: 'asc' }, include: { changedBy: { select: { id: true, firstName: true, lastName: true, role: true } } } },
        dispatch: { include: { destinationBranch: true, driver: true } },
        purchaseOrders: { select: { id: true, poNumber: true, status: true } },
      },
    });
    if (!req) throw new NotFoundException('Requisition not found');
    return req;
  }

  async create(dto: any, userId: number) {
    if (!dto.items?.length) throw new BadRequestException('At least one item is required');
    const requisitionNo = await this.generateReqNo();
    const req = await this.prisma.requisition.create({
      data: {
        requisitionNo, branchId: dto.branchId, department: dto.department, notes: dto.notes,
        priority: dto.priority ?? 'NORMAL', neededBy: dto.neededBy ? new Date(dto.neededBy) : undefined,
        status: RequisitionStatus.SUBMITTED, createdById: userId,
        items: { create: dto.items.map((i: any) => ({ productId: i.productId, requestedQty: i.requestedQty, unitId: i.unitId, notes: i.notes })) },
        statusHistory: { create: { status: RequisitionStatus.SUBMITTED, changedById: userId, notes: 'Requisition submitted' } },
      },
      include: { items: { include: { product: true } }, branch: true },
    });
    this.audit.create({
      userId,
      action: 'CREATE',
      entity: 'requisition',
      entityId: String(req.id),
      newValues: { requisitionNo: req.requisitionNo, department: req.department, itemCount: req.items.length },
    }).catch(() => {});
    const branchEn = (req as any).branch?.name ?? 'branch';
    const branchAr = (req as any).branch?.nameAr ?? branchEn;
    this.notifyReq(
      'REQUISITION_CREATED',
      { id: req.id, requisitionNo: req.requisitionNo, branchId: req.branchId, createdById: userId },
      userId,
      {
        title: 'New requisition received',
        titleAr: 'تم استلام طلب جديد',
        message: `${req.requisitionNo} from ${branchEn} (${req.department}) — ${req.items.length} item(s) awaiting review`,
        messageAr: `${req.requisitionNo} من ${branchAr} (${req.department}) — ${req.items.length} صنف بانتظار المراجعة`,
      },
    );
    return req;
  }

  async managerReview(id: number, action: 'approve' | 'modify' | 'cancel', userId: number, data?: any) {
    const req = await this.prisma.requisition.findUnique({ where: { id } });
    if (!req) throw new NotFoundException();
    if (req.status !== RequisitionStatus.SUBMITTED) throw new BadRequestException(`Cannot review in status: ${req.status}`);
    const statusMap = { approve: RequisitionStatus.MANAGER_APPROVED, modify: RequisitionStatus.MANAGER_MODIFIED, cancel: RequisitionStatus.MANAGER_CANCELLED } as const;
    const newStatus = statusMap[action];
    // Atomic: per-item approved-qty edits + the status transition + history
    // entry must all commit together, or none of them.
    const updated = await this.runSerializable(async (tx) => {
      if (data?.items?.length) {
        for (const item of data.items) {
          await tx.requisitionItem.update({ where: { id: item.id }, data: { approvedQty: item.approvedQty } });
        }
      }
      return tx.requisition.update({
        where: { id },
        data: { status: newStatus, reviewedById: userId, reviewedAt: new Date(), reviewNotes: data?.reviewNotes,
          statusHistory: { create: { status: newStatus, changedById: userId, notes: data?.reviewNotes ?? `Manager ${action}d` } } },
        include: { items: true, branch: true },
      });
    });
    this.audit.create({
      userId,
      action: 'MANAGER_REVIEW',
      entity: 'requisition',
      entityId: String(id),
      oldValues: { status: req.status },
      newValues: { status: newStatus, action },
    }).catch(() => {});
    const evMap = {
      approve: 'REQUISITION_APPROVED',
      modify: 'REQUISITION_MODIFIED',
      cancel: 'REQUISITION_CANCELLED',
    } as const;
    const labelEn = { approve: 'approved', modify: 'modified', cancel: 'cancelled' } as const;
    const labelAr = { approve: 'الموافقة على', modify: 'تعديل', cancel: 'إلغاء' } as const;
    const reason = data?.reviewNotes ? `: ${data.reviewNotes}` : '';
    this.notifyReq(
      evMap[action],
      { id: req.id, requisitionNo: req.requisitionNo, branchId: req.branchId, createdById: req.createdById },
      userId,
      {
        title: `Requisition ${labelEn[action]}`,
        titleAr: `تم ${labelAr[action]} الطلب`,
        message: `${req.requisitionNo} was ${labelEn[action]} by the manager${reason}`,
        messageAr: `تم ${labelAr[action]} الطلب ${req.requisitionNo} من قبل المدير${reason}`,
      },
    );
    return updated;
  }

  async procurementUpdate(id: number, status: RequisitionStatus, userId: number, dispatchData?: any) {
    const req = await this.prisma.requisition.findUnique({ where: { id }, include: { dispatch: true } });
    if (!req) throw new NotFoundException();
    const allowed = ALLOWED_TRANSITIONS[req.status] ?? [];
    if (!allowed.includes(status)) throw new BadRequestException(`Invalid transition: ${req.status} -> ${status}`);
    // Resolve the chosen driver (read-only) BEFORE the transaction so the
    // dispatch record carries the driver name/phone even if the driver row is
    // later edited/deactivated.
    let driverName = dispatchData?.driverName;
    let driverPhone = dispatchData?.driverPhone;
    const driverId = dispatchData?.driverId ? +dispatchData.driverId : undefined;
    if (status === RequisitionStatus.DISPATCHED_TO_BRANCH && driverId) {
      const drv = await this.prisma.driver.findUnique({ where: { id: driverId } });
      if (drv) { driverName = driverName || drv.name; driverPhone = driverPhone || drv.phone || undefined; }
    }

    // Atomic: dispatch upsert + status transition + history entry commit together.
    const updated = await this.runSerializable(async (tx) => {
      if (status === RequisitionStatus.DISPATCHED_TO_BRANCH) {
        const dp = { destinationBranchId: req.branchId, driverId, driverName, driverPhone, recipientName: dispatchData?.recipientName, trackingNotes: dispatchData?.trackingNotes, dispatchedAt: new Date() };
        if (req.dispatch) { await tx.requisitionDispatch.update({ where: { requisitionId: id }, data: dp }); }
        else { await tx.requisitionDispatch.create({ data: { requisitionId: id, ...dp } }); }
      }
      return tx.requisition.update({
        where: { id },
        data: { status, processedById: userId, processedAt: new Date(),
          statusHistory: { create: { status, changedById: userId, notes: dispatchData?.trackingNotes ?? `Status updated to ${status}` } } },
        include: { items: true, branch: true, dispatch: true },
      });
    });
    this.audit.create({
      userId,
      action: 'PROCUREMENT_UPDATE',
      entity: 'requisition',
      entityId: String(id),
      oldValues: { status: req.status },
      newValues: { status },
    }).catch(() => {});
    const procMap: Partial<Record<RequisitionStatus, { event: string; en: string; ar: string }>> = {
      [RequisitionStatus.ORDER_PLACED_WITH_SUPPLIER]: {
        event: 'REQUISITION_ORDER_PLACED',
        en: 'A purchase order was placed with the supplier',
        ar: 'تم إصدار أمر شراء للمورد',
      },
      [RequisitionStatus.RECEIVED_AT_WAREHOUSE]: {
        event: 'REQUISITION_RECEIVED_WAREHOUSE',
        en: 'Goods were received at the warehouse',
        ar: 'تم استلام البضائع في المستودع',
      },
      [RequisitionStatus.DISPATCHED_TO_BRANCH]: {
        event: 'REQUISITION_DISPATCHED',
        en: 'The order was dispatched to the branch',
        ar: 'تم إرسال الطلب إلى الفرع',
      },
    };
    const meta = procMap[status];
    if (meta) {
      const reason = dispatchData?.trackingNotes ? ` — ${dispatchData.trackingNotes}` : '';
      this.notifyReq(
        meta.event,
        { id: req.id, requisitionNo: req.requisitionNo, branchId: req.branchId, createdById: req.createdById },
        userId,
        {
          title: 'Requisition status updated',
          titleAr: 'تم تحديث حالة الطلب',
          message: `${req.requisitionNo}: ${meta.en}${reason}`,
          messageAr: `${req.requisitionNo}: ${meta.ar}${reason}`,
        },
      );
    }
    return updated;
  }

  async confirmReceipt(id: number, userId: number, userBranchId: number | undefined, receivedItems?: { itemId: number; receivedQty: number }[]) {
    const req = await this.prisma.requisition.findUnique({ where: { id }, include: { items: { include: { product: true, unit: true } }, dispatch: true } });
    if (!req) throw new NotFoundException();
    if (req.status !== RequisitionStatus.DISPATCHED_TO_BRANCH) throw new BadRequestException('Must be DISPATCHED_TO_BRANCH to confirm');
    if (userBranchId && req.branchId !== userBranchId) throw new ForbiddenException('Can only confirm for your own branch');
    // Atomic stock movement: every item's receivedQty update + inventory
    // adjustment (with row locking) + the dispatch confirmation + the status
    // transition all commit in ONE Serializable transaction. A failure on any
    // item rolls back the entire receipt so stock can never end up partially
    // credited against an unconfirmed requisition.
    const confirmed = await this.runSerializable(async (tx) => {
      for (const item of req.items) {
        const override = receivedItems?.find((r) => r.itemId === item.id);
        const qty = override?.receivedQty ?? item.approvedQty ?? item.requestedQty;
        await tx.requisitionItem.update({ where: { id: item.id }, data: { receivedQty: qty } });
        await this.inventoryService.applyAdjustment(tx, { productId: item.productId, branchId: req.branchId, quantity: qty, type: InventoryTxType.REQUISITION_FULFILLMENT, notes: `Received from ${req.requisitionNo}`, performedById: userId });
      }
      if (req.dispatch) { await tx.requisitionDispatch.update({ where: { requisitionId: id }, data: { confirmedAt: new Date() } }); }
      return tx.requisition.update({ where: { id }, data: { status: RequisitionStatus.CONFIRMED_RECEIPT, statusHistory: { create: { status: RequisitionStatus.CONFIRMED_RECEIPT, changedById: userId, notes: 'Receipt confirmed' } } }, include: { items: true, branch: true } });
    });
    this.audit.create({
      userId,
      action: 'CONFIRM_RECEIPT',
      entity: 'requisition',
      entityId: String(id),
      newValues: { status: RequisitionStatus.CONFIRMED_RECEIPT },
    }).catch(() => {});
    this.notifyReq(
      'REQUISITION_CONFIRMED',
      { id: req.id, requisitionNo: req.requisitionNo, branchId: req.branchId, createdById: req.createdById },
      userId,
      {
        title: 'Receipt confirmed',
        titleAr: 'تم تأكيد الاستلام',
        message: `${req.requisitionNo}: the branch confirmed receipt of the goods`,
        messageAr: `${req.requisitionNo}: قام الفرع بتأكيد استلام البضائع`,
      },
    );
    return confirmed;
  }

  async getDashboardStats(
    user?: { sub: number; role: Role; branchId?: number; branchIds?: number[] },
    branchId?: number,
  ) {
    // Apply the same role-based scoping as findAll so staff see their own stats
    const where: Record<string, unknown> = {};
    if (user) {
      const staffRoles: Role[] = [Role.KITCHEN, Role.BARISTA, Role.PASTRY, Role.CASHIER, Role.CLEANER];
      if (staffRoles.includes(user.role)) {
        where.branchId = user.branchId;
        where.createdById = user.sub;
      } else if (user.role === Role.BRANCH_MANAGER) {
        if (user.branchIds?.length) { where.branchId = { in: user.branchIds }; }
        else if (user.branchId) { where.branchId = user.branchId; }
      } else if (branchId) {
        where.branchId = branchId;
      }
    } else if (branchId) {
      where.branchId = branchId;
    }

    const [total, submitted, approved, inTransit, dispatched, confirmed, cancelled] = await Promise.all([
      this.prisma.requisition.count({ where }),
      this.prisma.requisition.count({ where: { ...where, status: RequisitionStatus.SUBMITTED } }),
      this.prisma.requisition.count({ where: { ...where, status: { in: [RequisitionStatus.MANAGER_APPROVED, RequisitionStatus.MANAGER_MODIFIED] } } }),
      this.prisma.requisition.count({ where: { ...where, status: { in: [RequisitionStatus.ORDER_PLACED_WITH_SUPPLIER, RequisitionStatus.RECEIVED_AT_WAREHOUSE] } } }),
      this.prisma.requisition.count({ where: { ...where, status: RequisitionStatus.DISPATCHED_TO_BRANCH } }),
      this.prisma.requisition.count({ where: { ...where, status: RequisitionStatus.CONFIRMED_RECEIPT } }),
      this.prisma.requisition.count({ where: { ...where, status: RequisitionStatus.MANAGER_CANCELLED } }),
    ]);
    return { total, submitted, approved, inTransit, dispatched, confirmed, cancelled };
  }
}
