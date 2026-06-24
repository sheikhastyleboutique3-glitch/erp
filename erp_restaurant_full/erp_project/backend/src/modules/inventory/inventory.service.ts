import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryTxType, Prisma } from '@prisma/client';

export interface AdjustInventoryDto {
  productId: number;
  branchId: number;
  quantity: number;
  type: InventoryTxType;
  notes?: string;
  manufactureDate?: string;
  expiryDate?: string;
  batchNumber?: string;
  // Optional per-batch purchase cost. Captured on the Batch row when an
  // expiry-tracked receipt mints/credits a batch (e.g. opening-stock import),
  // so inventory valuation starts correct. Ignored for non-tracked aggregate rows.
  unitCost?: number;
  // When set, the adjustment targets this specific batch's stock row.
  // Required for accurate FEFO; null means the legacy aggregate (non-tracked) row.
  batchId?: number | null;
  performedById?: number;
}

export interface OpeningStockRow {
  // Either sku or productId identifies the product; either branch (name) or
  // branchId identifies the destination branch.
  sku?: string;
  productId?: number;
  branch?: string;
  branchId?: number;
  quantity: number;
  unitCost?: number;
  batchNumber?: string;
  manufactureDate?: string;
  expiryDate?: string;
  notes?: string;
}

export interface OpeningStockRowResult {
  row: number;
  sku: string | null;
  branch: string | null;
  quantity: number | null;
  status: 'imported' | 'error';
  message?: string;
  batchNumber?: string | null;
}

export interface FefoAllocation {
  batchId: number | null;
  quantity: number;
  expiryDate: Date | null;
}

/** A batch (or unbatched aggregate row) with its live on-hand at one branch. */
export interface AvailableBatch {
  inventoryId: number;
  batchId: number | null;
  batchNumber: string | null;
  manufactureDate: Date | null;
  expiryDate: Date | null;
  availableQuantity: number;
  unitCost: number;
}

const DEDUCT_TYPES: InventoryTxType[] = [
  InventoryTxType.WASTAGE,
  InventoryTxType.TRANSFER_OUT,
  // Restaurant ERP: POS sales and production consumption deduct stock (FEFO).
  InventoryTxType.SALE,
  InventoryTxType.PRODUCTION_CONSUME,
];

const ADD_TYPES: InventoryTxType[] = [
  InventoryTxType.RECEIPT,
  InventoryTxType.TRANSFER_IN,
  InventoryTxType.REQUISITION_FULFILLMENT,
  // Restaurant ERP: produced output and customer returns add stock.
  InventoryTxType.PRODUCTION_YIELD,
  InventoryTxType.RETURN_IN,
];

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(branchId?: number, productId?: number, filters?: { search?: string; categoryId?: number; supplierId?: number }) {
    const productWhere: any = {};
    if (filters?.search) {
      productWhere.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { nameAr: { contains: filters.search, mode: 'insensitive' } },
        { sku: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters?.categoryId) productWhere.categoryId = filters.categoryId;
    if (filters?.supplierId) productWhere.supplierId = filters.supplierId;
    return this.prisma.inventory.findMany({
      where: {
        ...(branchId && { branchId }),
        ...(productId && { productId }),
        ...(Object.keys(productWhere).length > 0 && { product: productWhere }),
      },
      include: {
        product: {
          include: {
            category: { select: { id: true, name: true, nameAr: true, icon: true } },
            unit: { select: { id: true, name: true, abbreviation: true } },
            supplier: { select: { id: true, name: true, nameAr: true } },
          },
        },
        branch: { select: { id: true, name: true, nameAr: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Inventory collapsed to ONE row per product+branch so a product that holds
   * several batches no longer appears as duplicate rows. Each group exposes its
   * total on-hand quantity, batch count, the nearest (earliest) expiry, and the
   * full per-batch breakdown (FEFO-sorted) so the UI can show details on click
   * without a second request.
   */
  async findAllGrouped(
    branchId?: number,
    filters?: { search?: string; categoryId?: number; supplierId?: number },
  ) {
    const rows = await this.findAll(branchId, undefined, filters);
    const groups = new Map<string, any>();
    for (const r of rows as any[]) {
      const key = `${r.productId}-${r.branchId}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          id: key,
          productId: r.productId,
          branchId: r.branchId,
          product: r.product,
          branch: r.branch,
          quantity: 0,
          batchCount: 0,
          nearestExpiry: null as Date | null,
          updatedAt: r.updatedAt,
          batches: [] as any[],
        };
        groups.set(key, g);
      }
      g.quantity += r.quantity;
      // A row counts as a distinct batch when it carries any batch identity.
      if (r.batchId || r.batchNumber || r.expiryDate) g.batchCount += 1;
      if (r.expiryDate && (!g.nearestExpiry || new Date(r.expiryDate) < new Date(g.nearestExpiry))) {
        g.nearestExpiry = r.expiryDate;
      }
      if (r.updatedAt && new Date(r.updatedAt) > new Date(g.updatedAt)) g.updatedAt = r.updatedAt;
      g.batches.push({
        inventoryId: r.id,
        batchId: r.batchId ?? null,
        batchNumber: r.batchNumber ?? null,
        quantity: r.quantity,
        manufactureDate: r.manufactureDate ?? null,
        expiryDate: r.expiryDate ?? null,
        updatedAt: r.updatedAt,
      });
    }
    return Array.from(groups.values()).map((g) => ({
      ...g,
      batches: g.batches.sort((a: any, b: any) => {
        if (!a.expiryDate) return 1; // undated batches last (FEFO)
        if (!b.expiryDate) return -1;
        return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
      }),
    }));
  }

  /**
   * Available batches for a product at a branch, FEFO-ordered (earliest expiry
   * first; undated / unbatched stock last). `availableQuantity` is the live
   * on-hand for that batch AT THIS BRANCH, read from Inventory -- the single
   * source of truth. We deliberately do NOT denormalise a currentQuantity onto
   * the Batch model, because a batch can hold stock across multiple branches.
   */
  async getAvailableBatches(productId: number, branchId: number): Promise<AvailableBatch[]> {
    const rows = await this.prisma.inventory.findMany({
      where: { productId, branchId, quantity: { gt: 0 } },
      include: { batch: true },
      orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }],
    });
    return rows.map((r) => ({
      inventoryId: r.id,
      batchId: r.batchId ?? null,
      batchNumber: r.batchNumber ?? r.batch?.batchNumber ?? null,
      manufactureDate: r.manufactureDate ?? r.batch?.manufactureDate ?? null,
      expiryDate: r.expiryDate ?? r.batch?.expiryDate ?? null,
      availableQuantity: r.quantity,
      unitCost: r.batch?.unitCost ?? 0,
    }));
  }

  async getExpiryAlerts(branchId?: number, daysAhead = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + daysAhead);
    return this.prisma.inventory.findMany({
      where: {
        expiryDate: { lte: cutoff },
        quantity: { gt: 0 },
        ...(branchId && { branchId }),
      },
      include: {
        product: { select: { id: true, name: true, nameAr: true, sku: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });
  }

  async getLowStockAlerts(branchId?: number) {
    const inventory = await this.prisma.inventory.findMany({
      where: { ...(branchId && { branchId }) },
      include: { product: true, branch: { select: { id: true, name: true } } },
    });
    return inventory.filter((i) => i.quantity <= i.product.minStockLevel);
  }

  getTransactions(branchId?: number, productId?: number) {
    return this.prisma.inventoryTransaction.findMany({
      where: {
        ...(branchId && { branchId }),
        ...(productId && { productId }),
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        performedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /**
   * Core stock-mutation logic. Runs inside a caller-supplied transaction client
   * (`tx`) so it can be composed atomically with other writes — e.g. requisition
   * receipt confirmation adjusts many items + updates the requisition in ONE
   * transaction. Uses SELECT ... FOR UPDATE row locking to prevent races.
   *
   * NOTE: the caller is responsible for transaction isolation + serialization
   * retries. Use the public `adjust()` for stand-alone, self-retrying calls.
   */
  async applyAdjustment(
    tx: Prisma.TransactionClient,
    dto: AdjustInventoryDto,
  ): Promise<any> {
    const batchId = dto.batchId ?? null;
    // Row-lock the exact stock row (product + branch + batch). NULL-safe match so
    // the legacy aggregate (non-tracked) row locks correctly too.
    const locked = await tx.$queryRaw<
      Array<{ id: number; quantity: number }>
    >`
      SELECT id, quantity
      FROM inventory
      WHERE "productId" = ${dto.productId}
        AND "branchId" = ${dto.branchId}
        AND "batchId" IS NOT DISTINCT FROM ${batchId}
      FOR UPDATE
    `;
    const existing = locked[0];
    const currentQty = existing?.quantity ?? 0;
    const isDeduct = DEDUCT_TYPES.includes(dto.type);
    const isAdd = ADD_TYPES.includes(dto.type);
    if (isDeduct && currentQty < dto.quantity) {
      throw new ConflictException(
        `Insufficient stock: available ${currentQty}, requested ${dto.quantity}`,
      );
    }
    let newQty: number;
    if (isAdd) { newQty = currentQty + dto.quantity; }
    else if (isDeduct) { newQty = currentQty - dto.quantity; }
    else { newQty = dto.quantity; }

    const writeData = {
      quantity: newQty,
      ...(dto.manufactureDate && { manufactureDate: new Date(dto.manufactureDate) }),
      ...(dto.expiryDate && { expiryDate: new Date(dto.expiryDate) }),
      ...(dto.batchNumber && { batchNumber: dto.batchNumber }),
    };

    let inventory;
    if (existing) {
      inventory = await tx.inventory.update({ where: { id: existing.id }, data: writeData });
    } else {
      inventory = await tx.inventory.create({
        data: {
          productId: dto.productId,
          branchId: dto.branchId,
          batchId,
          ...writeData,
        },
      });
    }

    await tx.inventoryTransaction.create({
      data: {
        productId: dto.productId,
        branchId: dto.branchId,
        type: dto.type,
        quantity: dto.quantity,
        balanceBefore: currentQty,
        balanceAfter: newQty,
        notes: dto.notes,
        performedById: dto.performedById,
      },
    });
    return { ...inventory, balanceBefore: currentQty, balanceAfter: newQty };
  }

  /**
   * Selects stock batches to satisfy `quantity` of a product at a branch using
   * strict FEFO (First Expired, First Out): batches with the earliest expiry are
   * consumed first; null-expiry / non-tracked stock is consumed last.
   * Returns the planned allocations WITHOUT mutating stock (read-only preview).
   * Run inside a transaction with row locking for the actual deduction.
   */
  async planFefoAllocation(
    tx: Prisma.TransactionClient,
    productId: number,
    branchId: number,
    quantity: number,
  ): Promise<FefoAllocation[]> {
    const rows = await tx.inventory.findMany({
      where: { productId, branchId, quantity: { gt: 0 } },
      include: { batch: true },
      // NULLs last so dated batches are always consumed before undated stock.
      orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }],
    });
    const allocations: FefoAllocation[] = [];
    let remaining = quantity;
    for (const r of rows) {
      if (remaining <= 0) break;
      const take = Math.min(r.quantity, remaining);
      allocations.push({
        batchId: r.batchId ?? null,
        quantity: take,
        expiryDate: r.expiryDate ?? r.batch?.expiryDate ?? null,
      });
      remaining -= take;
    }
    if (remaining > 0) {
      throw new ConflictException(
        `Insufficient stock for FEFO allocation: short by ${remaining} units (product ${productId}, branch ${branchId})`,
      );
    }
    return allocations;
  }

  // ----------------------------------------------------------------------------
  // MANUAL / WASTAGE adjustment routing
  //
  // The raw `applyAdjustment` targets exactly ONE stock row and forces the caller
  // to know the batch. That made the UI hard (pick a batch by hand) and produced
  // wrong totals when a deduction hit the empty aggregate row instead of the real
  // batches. `applyManualAdjustment` removes that burden:
  //   - DEDUCT (WASTAGE / TRANSFER_OUT): consume across batches via FEFO.
  //   - ADD (RECEIPT / TRANSFER_IN / REQUISITION_FULFILLMENT) on an expiry-tracked
  //     product: find/create the matching Batch and credit it.
  //   - Otherwise (non-tracked add, or ADJUSTMENT absolute-set): operate on the
  //     single aggregate (null-batch) row, exactly as before.
  // An explicit dto.batchId always wins and is applied verbatim.
  // ----------------------------------------------------------------------------
  async applyManualAdjustment(
    tx: Prisma.TransactionClient,
    dto: AdjustInventoryDto,
  ): Promise<any> {
    if (dto.batchId != null) {
      // Explicit batch target. For a stock-out, enforce that the deduction fits
      // within THIS batch's on-hand at the branch and surface a clean 400 (the
      // generic applyAdjustment path would otherwise raise a 409 race error).
      if (DEDUCT_TYPES.includes(dto.type)) {
        const row = await tx.inventory.findFirst({
          where: { productId: dto.productId, branchId: dto.branchId, batchId: dto.batchId },
        });
        const available = row?.quantity ?? 0;
        if (available < dto.quantity) {
          throw new BadRequestException(
            `Insufficient stock in this batch: ${available} available, ${dto.quantity} requested`,
          );
        }
      }
      return this.applyAdjustment(tx, dto);
    }

    const isDeduct = DEDUCT_TYPES.includes(dto.type);
    const isAdd = ADD_TYPES.includes(dto.type);

    // DEDUCT across batches, earliest expiry first (FEFO), one tx-row per batch.
    if (isDeduct) {
      const allocations = await this.planFefoAllocation(
        tx,
        dto.productId,
        dto.branchId,
        dto.quantity,
      );
      const results: any[] = [];
      for (const a of allocations) {
        results.push(
          await this.applyAdjustment(tx, { ...dto, quantity: a.quantity, batchId: a.batchId }),
        );
      }
      const last = results[results.length - 1] ?? {};
      return { ...last, batchesAffected: results.length };
    }

    // ADD onto a real batch when the product is expiry-tracked.
    if (isAdd) {
      const product = await tx.product.findUnique({
        where: { id: dto.productId },
        select: { sku: true, tracksExpiry: true, expiryTrackingType: true, shelfLifeDays: true },
      });
      const resolved = this.resolveManualExpiry(product, dto);
      if (resolved) {
        const batch = await this.findOrCreateBatch(tx, dto, product?.sku ?? 'NA', resolved);
        return this.applyAdjustment(tx, {
          ...dto,
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          expiryDate: resolved.expiryDate.toISOString(),
          manufactureDate: resolved.manufactureDate?.toISOString(),
        });
      }
    }

    // Non-tracked add, or ADJUSTMENT (absolute set): operate on the aggregate
    // row and never stamp stray batch attributes onto it.
    return this.applyAdjustment(tx, {
      ...dto,
      batchId: null,
      expiryDate: undefined,
      manufactureDate: undefined,
      batchNumber: undefined,
    });
  }

  /**
   * Work out the manufacture/expiry for a manual ADD on an expiry-tracked
   * product. Returns null when the product is not tracked or no expiry can be
   * determined (caller then falls back to the aggregate row).
   */
  private resolveManualExpiry(
    product: { tracksExpiry?: boolean; expiryTrackingType?: any; shelfLifeDays?: number | null } | null,
    dto: AdjustInventoryDto,
  ): { manufactureDate: Date | null; expiryDate: Date } | null {
    if (!product?.tracksExpiry) return null;
    if (dto.expiryDate) {
      return {
        manufactureDate: dto.manufactureDate ? new Date(dto.manufactureDate) : null,
        expiryDate: new Date(dto.expiryDate),
      };
    }
    if (product.shelfLifeDays && product.shelfLifeDays > 0) {
      const mfg = dto.manufactureDate ? new Date(dto.manufactureDate) : new Date();
      const exp = new Date(mfg);
      exp.setDate(exp.getDate() + product.shelfLifeDays);
      return { manufactureDate: dto.manufactureDate ? mfg : null, expiryDate: exp };
    }
    return null;
  }

  /**
   * Reuse the batch matching a user-supplied batch number, otherwise mint a new
   * batch for this manual receipt.
   */
  private async findOrCreateBatch(
    tx: Prisma.TransactionClient,
    dto: AdjustInventoryDto,
    sku: string,
    resolved: { manufactureDate: Date | null; expiryDate: Date },
  ) {
    if (dto.batchNumber) {
      const existing = await tx.batch.findUnique({ where: { batchNumber: dto.batchNumber } });
      if (existing) return existing;
    }
    const count = await tx.batch.count();
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const batchNumber = dto.batchNumber || `B-${stamp}-${sku}-${String(count + 1).padStart(4, '0')}`;
    return tx.batch.create({
      data: {
        productId: dto.productId,
        batchNumber,
        manufactureDate: resolved.manufactureDate,
        expiryDate: resolved.expiryDate,
        unitCost: dto.unitCost ?? 0,
        receivedAtBranchId: dto.branchId,
        receivedDate: new Date(),
      },
    });
  }

  async adjust(dto: AdjustInventoryDto, retries = 3): Promise<any> {
    try {
      return await this.prisma.$transaction(
        (tx) => this.applyManualAdjustment(tx, dto),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 },
      );
    } catch (err: any) {
      if (err?.code === 'P2034' && retries > 0) {
        const delay = (4 - retries) * 100;
        await new Promise((r) => setTimeout(r, delay));
        return this.adjust(dto, retries - 1);
      }
      throw err;
    }
  }

  // ----------------------------------------------------------------------------
  // OPENING-STOCK BULK IMPORT
  //
  // Loads existing on-hand stock when a business first goes live (or onboards a
  // new branch). Each CSV row is posted as a RECEIPT through the same proven
  // `adjust` path, so batch creation, expiry resolution and FEFO behave exactly
  // like a manual Stock-In:
  //   - Expiry-tracked product + expiryDate          -> creates/credits that batch.
  //   - Expiry-tracked product + SHELF_LIFE_DAYS only -> expiry auto = mfg + shelf life.
  //   - Non-tracked product                           -> credits the aggregate row.
  // Rows are independent: one bad row never aborts the rest. We return a
  // per-row report so the user can fix and re-upload only the failures.
  // Products are matched by SKU and branches by (case-insensitive) name or ID,
  // so the CSV stays human-friendly while resolution happens server-side.
  // ----------------------------------------------------------------------------
  async bulkOpeningStock(
    rows: OpeningStockRow[],
    auth?: { id?: number; role?: string; branchIds?: number[] },
  ): Promise<{ imported: number; failed: number; total: number; results: OpeningStockRowResult[] }> {
    const performedById = auth?.id;
    const isSuperAdmin = auth?.role === 'SUPER_ADMIN';
    const allowedBranchIds = new Set(auth?.branchIds ?? []);
    // Resolve lookups once up front to avoid a query per row.
    const products = await this.prisma.product.findMany({
      select: { id: true, sku: true, tracksExpiry: true, expiryTrackingType: true, shelfLifeDays: true },
    });
    const branches = await this.prisma.branch.findMany({
      select: { id: true, name: true, nameAr: true },
    });
    const bySku = new Map(products.map((p) => [p.sku.trim().toLowerCase(), p]));
    const byProductId = new Map(products.map((p) => [p.id, p]));
    const branchByName = new Map<string, { id: number; name: string }>();
    for (const b of branches) {
      branchByName.set(b.name.trim().toLowerCase(), { id: b.id, name: b.name });
      if (b.nameAr) branchByName.set(b.nameAr.trim().toLowerCase(), { id: b.id, name: b.name });
    }
    const branchById = new Map(branches.map((b) => [b.id, b]));

    const results: OpeningStockRowResult[] = [];
    let imported = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNo = i + 1;
      const skuLabel = r.sku?.trim() || (r.productId != null ? `#${r.productId}` : null);
      const branchLabel = r.branch?.trim() || (r.branchId != null ? `#${r.branchId}` : null);

      try {
        // --- Resolve product ---
        const product =
          r.productId != null
            ? byProductId.get(Number(r.productId))
            : r.sku
            ? bySku.get(r.sku.trim().toLowerCase())
            : undefined;
        if (!product) {
          throw new Error(`Unknown product (no match for ${skuLabel ?? 'blank'})`);
        }

        // --- Resolve branch ---
        let branch: { id: number; name: string } | undefined;
        if (r.branchId != null) {
          const b = branchById.get(Number(r.branchId));
          if (b) branch = { id: b.id, name: b.name };
        } else if (r.branch) {
          branch = branchByName.get(r.branch.trim().toLowerCase());
        }
        if (!branch) {
          throw new Error(`Unknown branch (no match for ${branchLabel ?? 'blank'})`);
        }

        // Branch isolation: non-admins may only load stock into branches they
        // are assigned to (the controller guard only checks a top-level
        // branchId, so per-row branches are enforced here).
        if (!isSuperAdmin && !allowedBranchIds.has(branch.id)) {
          throw new Error(`Access denied: you are not assigned to branch "${branch.name}"`);
        }

        // --- Validate quantity ---
        const quantity = Number(r.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error(`Quantity must be a positive number (got "${r.quantity}")`);
        }

        // --- Validate dates ---
        const expiryDate = this.parseImportDate(r.expiryDate, 'expiryDate');
        const manufactureDate = this.parseImportDate(r.manufactureDate, 'manufactureDate');
        if (expiryDate && manufactureDate && expiryDate <= manufactureDate) {
          throw new Error('expiryDate must be after manufactureDate');
        }

        // --- Expiry-tracked products must end up on a real batch ---
        if (product.tracksExpiry) {
          const hasExpiry = !!expiryDate;
          const canDeriveFromShelfLife =
            product.expiryTrackingType === 'SHELF_LIFE_DAYS' &&
            !!product.shelfLifeDays &&
            product.shelfLifeDays > 0;
          if (!hasExpiry && !canDeriveFromShelfLife) {
            throw new Error(
              product.expiryTrackingType === 'MANUFACTURE_TO_EXPIRY'
                ? 'expiryDate is required for this expiry-tracked product (MANUFACTURE_TO_EXPIRY)'
                : 'expiryDate or manufactureDate is required for this expiry-tracked product',
            );
          }
        }

        const unitCost =
          r.unitCost != null && Number.isFinite(Number(r.unitCost))
            ? Number(r.unitCost)
            : undefined;

        const result = await this.adjust({
          productId: product.id,
          branchId: branch.id,
          quantity,
          type: InventoryTxType.RECEIPT,
          unitCost,
          batchNumber: r.batchNumber?.trim() || undefined,
          manufactureDate: manufactureDate?.toISOString(),
          expiryDate: expiryDate?.toISOString(),
          notes: r.notes?.trim() || 'Opening stock import',
          performedById,
        });

        imported++;
        results.push({
          row: rowNo,
          sku: product.sku,
          branch: branch.name,
          quantity,
          status: 'imported',
          batchNumber: result?.batchNumber ?? null,
        });
      } catch (err: any) {
        results.push({
          row: rowNo,
          sku: skuLabel,
          branch: branchLabel,
          quantity: r.quantity ?? null,
          status: 'error',
          message: err?.message ?? 'Import failed',
        });
      }
    }

    this.audit
      .create({
        userId: performedById,
        action: 'OPENING_STOCK_IMPORT',
        entity: 'inventory',
        newValues: { imported, failed: rows.length - imported, total: rows.length },
      })
      .catch(() => {});

    return { imported, failed: rows.length - imported, total: rows.length, results };
  }

  /** Parse a YYYY-MM-DD (or ISO) import date, rejecting clearly invalid values. */
  private parseImportDate(value: string | undefined, field: string): Date | null {
    if (!value || !value.trim()) return null;
    const d = new Date(value.trim());
    if (isNaN(d.getTime())) {
      throw new Error(`Invalid ${field} "${value}" (use YYYY-MM-DD)`);
    }
    return d;
  }
}
