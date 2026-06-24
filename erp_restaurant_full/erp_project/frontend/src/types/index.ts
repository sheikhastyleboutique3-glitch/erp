export type Role = 'SUPER_ADMIN' | 'BRANCH_MANAGER' | 'PROCUREMENT' | 'WAREHOUSE' | 'KITCHEN' | 'BARISTA' | 'PASTRY' | 'CASHIER' | 'CLEANER';
export type RequisitionStatus = 'DRAFT' | 'SUBMITTED' | 'MANAGER_APPROVED' | 'MANAGER_MODIFIED' | 'MANAGER_CANCELLED' | 'ORDER_PLACED_WITH_SUPPLIER' | 'RECEIVED_AT_WAREHOUSE' | 'DISPATCHED_TO_BRANCH' | 'CONFIRMED_RECEIPT';
export type WastageReason = 'EXPIRED' | 'DAMAGED' | 'SPILLAGE' | 'OVERPRODUCTION' | 'QUALITY_REJECTION' | 'OTHER';
export type PurchaseOrderStatus = 'DRAFT' | 'SENT_TO_SUPPLIER' | 'PARTIALLY_RECEIVED' | 'FULLY_RECEIVED' | 'CANCELLED';
export type AlertType = 'EXPIRY_WARNING' | 'LOW_STOCK' | 'WASTAGE_THRESHOLD';
export type InventoryTxType = 'RECEIPT' | 'REQUISITION_FULFILLMENT' | 'WASTAGE' | 'ADJUSTMENT' | 'TRANSFER_IN' | 'TRANSFER_OUT';
export type Priority = 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';
export type ExpiryTrackingType = 'SHELF_LIFE_DAYS' | 'MANUFACTURE_TO_EXPIRY';
export type TransferStatus = 'DRAFT' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';

export interface Branch { id: number; name: string; nameAr: string; address?: string | null; phone?: string | null; isActive: boolean; isWarehouse: boolean; cashFloat?: number; }
export interface AssignedBranch { id: number; name: string; nameAr: string; isPrimary: boolean; }
export interface User { id: number; email: string; firstName: string; lastName: string; firstNameAr?: string | null; lastNameAr?: string | null; role: Role; isActive: boolean; language: string; branchId?: number | null; branch?: Pick<Branch, 'id' | 'name' | 'nameAr'> | null; assignedBranches?: AssignedBranch[]; }
export interface Category { id: number; name: string; nameAr: string; description?: string | null; icon?: string | null; sortOrder: number; isActive: boolean; }
export interface Unit { id: number; name: string; nameAr?: string | null; abbreviation: string; isActive: boolean; }
export interface Supplier { id: number; name: string; nameAr?: string | null; contactName?: string | null; email?: string | null; phone?: string | null; address?: string | null; paymentTerms?: string | null; isActive: boolean; }
export interface Product {
  id: number; sku: string; name: string; nameAr: string; description?: string | null; descriptionAr?: string | null;
  recipe?: string | null; recipeAr?: string | null; imageUrl?: string | null; imageUrls: string[];
  categoryId?: number | null; category?: Pick<Category, 'id' | 'name' | 'nameAr' | 'icon'> | null;
  unitId?: number | null; unit?: Pick<Unit, 'id' | 'name' | 'nameAr' | 'abbreviation'> | null;
  minStockLevel: number; reorderPoint: number; isActive: boolean;
  supplierId?: number | null; supplier?: Pick<Supplier, 'id' | 'name'> | null;
  costPrice: number; taxCategory?: string | null; yieldFactor: number; shelfLifeDays?: number | null;
  tracksExpiry?: boolean; expiryTrackingType?: ExpiryTrackingType | null;
  isArchived: boolean; archivedAt?: string | null;
}
export interface Inventory { id: number; productId: number; product: Product; branchId: number; branch: Pick<Branch, 'id' | 'name' | 'nameAr'>; quantity: number; manufactureDate?: string | null; expiryDate?: string | null; batchNumber?: string | null; updatedAt: string; }
export interface Requisition { id: number; requisitionNo: string; branchId: number; branch: Pick<Branch, 'id' | 'name' | 'nameAr'>; department: string; status: RequisitionStatus; priority: Priority; notes?: string | null; neededBy?: string | null; createdById: number; createdBy: Pick<User, 'id' | 'firstName' | 'lastName' | 'role'>; createdAt: string; updatedAt: string; items: any[]; _count?: { items: number }; }
export interface WastageRecord { id: number; branchId: number; branch: Pick<Branch, 'id' | 'name' | 'nameAr'>; productId: number; product: Pick<Product, 'id' | 'name' | 'nameAr' | 'sku'>; quantity: number; reason: WastageReason; notes?: string | null; loggedById: number; createdAt: string; }
export interface PurchaseOrder { id: number; poNumber: string; supplierId: number; supplier: Pick<Supplier, 'id' | 'name'>; branchId: number; branch: Pick<Branch, 'id' | 'name' | 'nameAr'>; status: PurchaseOrderStatus; currency: string; totalAmount: number; createdAt: string; items: any[]; }
export interface Alert { id: number; type: AlertType; title: string; titleAr?: string | null; message: string; messageAr?: string | null; branchId?: number | null; isRead: boolean; isResolved: boolean; createdAt: string; }
export interface SupplierPriceHistory {
  id: number;
  supplierId: number;
  productId: number;
  product: Pick<Product, 'id' | 'name' | 'nameAr' | 'sku'>;
  oldPrice: number;
  newPrice: number;
  changedBy?: Pick<User, 'id' | 'firstName' | 'lastName'> | null;
  source: string;
  notes?: string | null;
  createdAt: string;
}
export interface TransferOrderItem {
  id: number; transferOrderId: number; productId: number;
  product?: Pick<Product, 'id' | 'name' | 'nameAr' | 'sku'>;
  batchId?: number | null; batch?: { id: number; batchNumber: string; expiryDate?: string | null } | null;
  quantity: number; expiryDate?: string | null;
}
export interface TransferOrder {
  id: number; transferNo: string;
  fromBranchId: number; fromBranch?: Pick<Branch, 'id' | 'name' | 'nameAr'>;
  toBranchId: number; toBranch?: Pick<Branch, 'id' | 'name' | 'nameAr'>;
  status: TransferStatus; notes?: string | null;
  createdBy?: Pick<User, 'id' | 'firstName' | 'lastName'> | null;
  receivedBy?: Pick<User, 'id' | 'firstName' | 'lastName'> | null;
  dispatchedAt?: string | null; receivedAt?: string | null; createdAt: string;
  items: TransferOrderItem[];
}
export interface FefoAllocation { batchId: number | null; quantity: number; expiryDate: string | null; }

export interface ApiResponse<T> { success: boolean; data: T; timestamp: string; }
export interface LoginResponse { access_token: string; refresh_token: string; user: User; }
