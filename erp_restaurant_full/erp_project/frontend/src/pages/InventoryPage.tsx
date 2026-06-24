import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import api, { downloadCsv } from '../lib/api';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import { format, differenceInDays, addDays } from 'date-fns';
import {
  PlusIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, MagnifyingGlassIcon, AdjustmentsHorizontalIcon,
  XMarkIcon, ArchiveBoxIcon, CalendarDaysIcon, ExclamationTriangleIcon,
  InboxIcon, ChevronRightIcon, ArrowDownIcon, ArrowUpIcon, PencilSquareIcon,
} from '@heroicons/react/24/outline';
import OpeningStockDrawer from '../components/OpeningStockDrawer';

type Tab = 'all' | 'expiry' | 'lowstock';

/** A batch (or unbatched aggregate row) with its live on-hand at one branch. */
interface AvailableBatch {
  inventoryId: number;
  batchId: number | null;
  batchNumber: string | null;
  manufactureDate: string | null;
  expiryDate: string | null;
  availableQuantity: number;
  unitCost: number;
}

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'all',      label: 'All Inventory', icon: ArchiveBoxIcon },
  { key: 'expiry',   label: 'Near Expiry',   icon: CalendarDaysIcon },
  { key: 'lowstock', label: 'Low Stock',     icon: ExclamationTriangleIcon },
];

export default function InventoryPage() {
  const { t, i18n } = useTranslation();
  const { user, activeBranch } = useAuth();
  const qc = useQueryClient();
  const isRTL = i18n.language === 'ar';
  const [tab, setTab] = useState<Tab>('all');
  const [adjustModal, setAdjustModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  // Clicking a grouped row opens this batch-breakdown popup.
  const [batchModal, setBatchModal] = useState<any | null>(null);
  const [adjustForm, setAdjustForm] = useState({
    productId: '', branchId: activeBranch?.id?.toString() || '',
    quantity: '', type: 'RECEIPT', notes: '', manufactureDate: '', expiryDate: '', batchNumber: '', batchId: '',
  });
  const [exporting, setExporting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');

  const isAdmin = ['SUPER_ADMIN', 'PROCUREMENT', 'WAREHOUSE'].includes(user?.role || '');

  const buildParams = () => {
    const params: any = {};
    if (activeBranch?.id) params.branchId = activeBranch.id;
    if (search) params.search = search;
    if (categoryFilter) params.categoryId = categoryFilter;
    if (supplierFilter) params.supplierId = supplierFilter;
    return params;
  };

  const { data: inventory, isLoading } = useQuery({
    queryKey: ['inventory', tab, activeBranch?.id, search, categoryFilter, supplierFilter],
    queryFn: () => {
      if (tab === 'expiry') return api.get('/inventory/expiry-alerts', { params: { branchId: activeBranch?.id || undefined } }).then(r => r.data.data);
      if (tab === 'lowstock') return api.get('/inventory/low-stock', { params: { branchId: activeBranch?.id || undefined } }).then(r => r.data.data);
      // Grouped: one row per product+branch (no more duplicate per-batch rows).
      return api.get('/inventory/grouped', { params: buildParams() }).then(r => r.data.data);
    },
  });

  const { data: products } = useQuery({ queryKey: ['products-list'], queryFn: () => api.get('/products').then(r => r.data.data) });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/categories').then(r => r.data.data) });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: () => api.get('/suppliers').then(r => r.data.data) });

  // Filter options derived from what's actually on-hand in the active branch, so
  // the Category/Supplier dropdowns only offer values that exist in inventory.
  const { data: invForOptions } = useQuery({
    queryKey: ['inventory-options', activeBranch?.id],
    queryFn: () => api.get('/inventory', { params: { branchId: activeBranch?.id || undefined } }).then(r => r.data.data),
  });
  const availCategories = (() => {
    const m = new Map<number, any>();
    (invForOptions || []).forEach((r: any) => { const c = r.product?.category; if (c) m.set(c.id, c); });
    return Array.from(m.values()).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
  })();
  const availSuppliers = (() => {
    const m = new Map<number, any>();
    (invForOptions || []).forEach((r: any) => { const s = r.product?.supplier; if (s) m.set(s.id, s); });
    return Array.from(m.values()).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
  })();
  const { data: branches } = useQuery({
    queryKey: ['branches'], queryFn: () => api.get('/branches').then(r => r.data.data),
    enabled: isAdmin,
  });

  // Live batches (with on-hand qty) for the product+branch chosen in the adjust
  // modal. Drives the batch dropdown for both Stock In and Stock Out.
  const { data: availableBatches } = useQuery<AvailableBatch[]>({
    queryKey: ['available-batches', adjustForm.productId, adjustForm.branchId],
    queryFn: () => api
      .get(`/inventory/products/${adjustForm.productId}/branches/${adjustForm.branchId}/available-batches`)
      .then(r => r.data.data),
    enabled: adjustModal && !!adjustForm.productId && !!adjustForm.branchId,
  });

  const adjustMutation = useMutation({
    mutationFn: (data: any) => api.post('/inventory/adjust', data),
    onSuccess: () => { toast.success('Inventory adjusted'); qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['available-batches'] }); setAdjustModal(false); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  // Expiry chip tone (dark-friendly via semantic tokens).
  const expiryChip = (expiryDate: string) => {
    const days = differenceInDays(new Date(expiryDate), new Date());
    if (days <= 3) return 'text-destructive bg-destructive-subtle';
    if (days <= 7) return 'text-warning bg-warning-subtle';
    return 'text-success bg-success-subtle';
  };

  // Human-readable remaining-days label for the expiry column.
  const remainingLabel = (expiryDate: string) => {
    const days = differenceInDays(new Date(expiryDate), new Date());
    if (days < 0) return `Expired ${Math.abs(days)}d ago`;
    if (days === 0) return 'Expires today';
    if (days === 1) return '1 day left';
    return `${days} days left`;
  };

  // When a manufacture date is picked, auto-fill expiry = manufacture + shelf-life
  // (from the selected product). The user can still override the expiry after.
  const onManufactureChange = (val: string) => {
    setAdjustForm(p => {
      const prod = (products || []).find((x: any) => x.id === +p.productId);
      let expiryDate = p.expiryDate;
      if (val && prod?.shelfLifeDays) {
        expiryDate = format(addDays(new Date(val), prod.shelfLifeDays), 'yyyy-MM-dd');
      }
      return { ...p, manufactureDate: val, expiryDate };
    });
  };

  const canAdjust = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'PROCUREMENT', 'WAREHOUSE'].includes(user?.role || '');

  // Selected product in the adjust form drives which batch fields are shown.
  const selectedProduct = (products || []).find((x: any) => x.id === +adjustForm.productId);
  const showBatchFields = adjustForm.type === 'RECEIPT' && !!selectedProduct?.tracksExpiry;

  // ---- Batch-aware adjustment helpers ----
  const isStockOut = adjustForm.type === 'WASTAGE';
  const isStockIn = adjustForm.type === 'RECEIPT';
  // Only real (dated) batches are selectable; the unbatched aggregate row is excluded.
  const batchList: AvailableBatch[] = (availableBatches || []).filter((b) => b.batchId != null);
  const selectedBatch = batchList.find((b) => String(b.batchId) === adjustForm.batchId);
  // Stock In on a tracked product defaults to creating a new batch unless an
  // existing batch id is chosen.
  const creatingNewBatch = isStockIn && (adjustForm.batchId === '' || adjustForm.batchId === 'NEW');
  // New-batch date/lot inputs only appear when creating a new batch on Stock In.
  const showNewBatchInputs = isStockIn && !!selectedProduct?.tracksExpiry && creatingNewBatch;
  // Show the batch dropdown for tracked products on either workflow.
  const showBatchPicker = !!selectedProduct?.tracksExpiry && (isStockOut || isStockIn);
  // Client-side guard mirrored by the backend 400.
  const overDeduct = isStockOut && !!selectedBatch && +adjustForm.quantity > selectedBatch.availableQuantity;

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (activeBranch?.id) params.set('branchId', String(activeBranch.id));
      // Carry the on-screen filters into the export so the CSV matches the table.
      if (search) params.set('search', search);
      if (categoryFilter) params.set('categoryId', categoryFilter);
      if (supplierFilter) params.set('supplierId', supplierFilter);
      const qs = params.toString();
      const exportType = tab === 'expiry' ? 'expiry-alerts' : tab === 'lowstock' ? 'low-stock' : 'inventory';
      await downloadCsv(`/reports/export/${exportType}/csv${qs ? `?${qs}` : ''}`, `${exportType}-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => { setSearch(''); setCategoryFilter(''); setSupplierFilter(''); };
  const activeFilterCount = [search, categoryFilter, supplierFilter].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;

  const COLS = 5;

  return (
    <div>
      <PageHeader
        title={t('inventory.title')}
        subtitle={!isLoading && inventory ? `${inventory.length} ${inventory.length === 1 ? 'item' : 'items'}` : undefined}
        actions={
          <>
            {canAdjust && (
              <button
                onClick={() => setAdjustModal(true)}
                className="inline-flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-accent-fg px-4 py-2 rounded-lg text-sm font-semibold shadow-elev-sm transition-theme focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PlusIcon className="w-4 h-4" /> Adjust Stock
              </button>
            )}
            {canAdjust && (
              <button
                onClick={() => setImportModal(true)}
                className="inline-flex items-center gap-1.5 bg-surface border border-border text-fg-muted hover:text-fg hover:bg-surface-2 px-3 py-2 rounded-lg text-sm font-medium transition-theme"
              >
                <ArrowUpTrayIcon className="w-4 h-4" /> Opening Stock
              </button>
            )}
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 bg-surface border border-border text-fg-muted hover:text-fg hover:bg-surface-2 px-3 py-2 rounded-lg text-sm font-medium transition-theme disabled:opacity-50"
            >
              <ArrowDownTrayIcon className="w-4 h-4" /> {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </>
        }
      />

      {/* Toolbar: search + filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute inset-y-0 my-auto start-3 w-4 h-4 text-fg-subtle pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search product name or SKU…"
            className="w-full ps-9 pe-4 py-2.5 bg-surface border border-border rounded-lg text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-theme"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border transition-theme ${
            showFilters || hasActiveFilters
              ? 'bg-accent-subtle border-accent text-accent-subtle-fg'
              : 'bg-surface border-border text-fg-muted hover:text-fg hover:bg-surface-2'
          }`}
        >
          <AdjustmentsHorizontalIcon className="w-4 h-4" /> Filters
          {hasActiveFilters && (
            <span className="bg-accent text-accent-fg text-xs rounded-full w-5 h-5 flex items-center justify-center nums">{activeFilterCount}</span>
          )}
        </button>
      </div>

      {showFilters && (
        <div className="bg-surface rounded-xl border border-border p-4 mb-4 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-fg-subtle uppercase tracking-wide">Advanced Filters</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs text-destructive hover:opacity-80">
                <XMarkIcon className="w-3.5 h-3.5" /> Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-fg-muted mb-1">Category</label>
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">All Categories</option>
                {availCategories.map((c: any) => <option key={c.id} value={c.id}>{isRTL ? (c.nameAr || c.name) : c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-fg-muted mb-1">Supplier</label>
              <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">All Suppliers</option>
                {availSuppliers.map((s: any) => <option key={s.id} value={s.id}>{isRTL ? (s.nameAr || s.name) : s.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Segmented tab control */}
      <div className="inline-flex p-1 bg-surface-2 rounded-lg mb-5">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-theme ${
              tab === key ? 'bg-surface text-fg shadow-elev-sm' : 'text-fg-muted hover:text-fg'
            }`}
          >
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* Data table */}
      <div className="bg-surface rounded-xl border border-border shadow-elev-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 sticky top-0 z-10">
              <tr className="border-b border-border">
                <th className="text-start font-semibold text-fg-muted px-4 py-2.5 text-xs uppercase tracking-wide">Product</th>
                <th className="text-start font-semibold text-fg-muted px-4 py-2.5 text-xs uppercase tracking-wide">{t('common.branch')}</th>
                <th className="text-end font-semibold text-fg-muted px-4 py-2.5 text-xs uppercase tracking-wide">{t('inventory.quantity')}</th>
                <th className="text-start font-semibold text-fg-muted px-4 py-2.5 text-xs uppercase tracking-wide">{t('inventory.expiry')}</th>
                <th className="text-start font-semibold text-fg-muted px-4 py-2.5 text-xs uppercase tracking-wide">{t('inventory.batch')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                // Skeleton loading rows
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: COLS }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className={`h-3.5 rounded bg-surface-2 animate-pulse ${j === 0 ? 'w-40' : j === 2 ? 'w-12 ms-auto' : 'w-24'}`} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : inventory?.length ? (
                inventory.map((item: any) => {
                  const grouped = tab === 'all';
                  const qty = item.quantity;
                  const low = qty <= (item.product?.minStockLevel ?? 0);
                  const expiry = grouped ? item.nearestExpiry : item.expiryDate;
                  const batchCount = grouped ? (item.batchCount || 0) : undefined;
                  return (
                    <tr
                      key={item.id}
                      onClick={grouped ? () => setBatchModal(item) : undefined}
                      className={`transition-colors hover:bg-surface-2 ${grouped ? 'cursor-pointer' : ''}`}
                    >
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-fg">{isRTL ? item.product?.nameAr : item.product?.name}</p>
                        <p className="text-xs text-fg-subtle nums">{item.product?.sku}</p>
                      </td>
                      <td className="px-4 py-2.5 text-fg-muted">{isRTL ? item.branch?.nameAr : item.branch?.name}</td>
                      <td className="px-4 py-2.5 text-end whitespace-nowrap">
                        <span className={`font-semibold nums ${low ? 'text-destructive' : 'text-fg'}`}>{qty}</span>
                        <span className="text-xs text-fg-subtle ms-1">{item.product?.unit?.abbreviation}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {expiry
                          ? <div className="flex flex-col gap-0.5">
                              <span className={`inline-block w-fit text-xs px-2 py-0.5 rounded-full font-medium nums ${expiryChip(expiry)}`}>{format(new Date(expiry), 'MMM d, yyyy')}</span>
                              <span className="text-[11px] text-fg-subtle nums">{grouped && (batchCount || 0) > 1 ? 'earliest of ' + batchCount + ' batches' : remainingLabel(expiry)}</span>
                            </div>
                          : <span className="text-xs text-fg-subtle">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {grouped ? (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-fg-muted nums">
                              {batchCount ? `${batchCount} batch${batchCount > 1 ? 'es' : ''}` : 'No batches'}
                            </span>
                            <ChevronRightIcon className="w-4 h-4 text-fg-subtle shrink-0" />
                          </div>
                        ) : (
                          <span className="text-xs text-fg-muted nums">{item.batchNumber || '—'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={COLS} className="py-16">
                    <div className="flex flex-col items-center justify-center text-center gap-2">
                      <InboxIcon className="w-10 h-10 text-fg-subtle" />
                      <p className="text-sm text-fg-muted">{t('common.noData')}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjust Stock Modal */}
      <Modal open={adjustModal} onClose={() => setAdjustModal(false)} title="Adjust Inventory" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-fg mb-1">Product</label>
              <select value={adjustForm.productId} onChange={e => setAdjustForm(p => ({ ...p, productId: e.target.value, batchId: '' }))} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Select</option>
                {products?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {branches && (
              <div>
                <label className="block text-sm font-medium text-fg mb-1">{t('common.branch')}</label>
                <select value={adjustForm.branchId} onChange={e => setAdjustForm(p => ({ ...p, branchId: e.target.value, batchId: '' }))} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-fg mb-1">Action</label>
              <select value={adjustForm.type} onChange={e => setAdjustForm(p => ({ ...p, type: e.target.value, batchId: '' }))} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="RECEIPT">Stock In — add quantity</option>
                <option value="WASTAGE">Stock Out — remove quantity</option>
                <option value="ADJUSTMENT">Set exact count</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-fg mb-1">{t('inventory.quantity')}</label>
              <input type="number" min={0} value={adjustForm.quantity} onChange={e => setAdjustForm(p => ({ ...p, quantity: e.target.value }))} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-fg nums focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            {showBatchPicker && (
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-fg mb-1">Batch</label>
                <select
                  value={isStockIn ? (adjustForm.batchId || 'NEW') : adjustForm.batchId}
                  onChange={e => setAdjustForm(p => ({ ...p, batchId: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {isStockOut && <option value="">Auto — oldest expiry first (FEFO)</option>}
                  {isStockIn && <option value="NEW">+ Create New Batch</option>}
                  {batchList.map((b) => (
                    <option key={b.batchId!} value={b.batchId!}>
                      {(b.batchNumber || `Batch #${b.batchId}`)} — {b.availableQuantity} units left{b.expiryDate ? ` — exp ${format(new Date(b.expiryDate), 'MMM d, yyyy')}` : ''}
                    </option>
                  ))}
                </select>
                {isStockOut && batchList.length === 0 && (
                  <p className="text-xs text-fg-subtle mt-1">No dated batches on hand — removal will use available stock (FEFO).</p>
                )}
                {/* Read-only confirmation of the selected batch's dates. */}
                {selectedBatch && (
                  <>
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <div>
                        <label className="block text-xs text-fg-subtle mb-1">Manufacture Date</label>
                        <input readOnly value={selectedBatch.manufactureDate ? format(new Date(selectedBatch.manufactureDate), 'yyyy-MM-dd') : '—'} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-fg-muted nums" />
                      </div>
                      <div>
                        <label className="block text-xs text-fg-subtle mb-1">Expiry Date</label>
                        <input readOnly value={selectedBatch.expiryDate ? format(new Date(selectedBatch.expiryDate), 'yyyy-MM-dd') : '—'} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-fg-muted nums" />
                      </div>
                    </div>
                    {isStockOut && (
                      <p className={`text-xs mt-1 ${overDeduct ? 'text-destructive' : 'text-fg-subtle'}`}>
                        {selectedBatch.availableQuantity} units available in this batch{overDeduct ? ' — quantity exceeds availability' : ''}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
            {showNewBatchInputs && (
              <>
                <div>
                  <label className="block text-sm font-medium text-fg mb-1">Manufacture Date</label>
                  <input type="date" value={adjustForm.manufactureDate} onChange={e => onManufactureChange(e.target.value)} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-fg nums focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg mb-1">Expiry Date</label>
                  <input type="date" value={adjustForm.expiryDate} onChange={e => setAdjustForm(p => ({ ...p, expiryDate: e.target.value }))} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-fg nums focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                  {adjustForm.expiryDate
                    ? <p className="text-xs text-fg-subtle mt-1">{remainingLabel(adjustForm.expiryDate)}</p>
                    : selectedProduct?.shelfLifeDays
                      ? <p className="text-xs text-fg-subtle mt-1">Shelf life: {selectedProduct.shelfLifeDays} days — pick a manufacture date to auto-fill.</p>
                      : null}
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg mb-1">Batch / Lot No. <span className="text-fg-subtle font-normal">(optional)</span></label>
                  <input type="text" value={adjustForm.batchNumber} onChange={e => setAdjustForm(p => ({ ...p, batchNumber: e.target.value }))} placeholder="Auto-generated if blank" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                </div>
              </>
            )}
          </div>

          {/* Context hint so the user knows what will happen — no manual batch picking needed. */}
          {adjustForm.productId && (
            <div className="flex items-start gap-2 text-xs rounded-lg px-3 py-2 bg-surface-2 text-fg-muted">
              {adjustForm.type === 'WASTAGE' && <><ArrowDownIcon className="w-4 h-4 mt-0.5 text-destructive shrink-0" /><span>Removes stock starting from the <strong>oldest-expiry batch first</strong> (FEFO). No need to choose a batch.</span></>}
              {adjustForm.type === 'RECEIPT' && <><ArrowUpIcon className="w-4 h-4 mt-0.5 text-success shrink-0" /><span>{showBatchFields ? 'Adds a new batch with the expiry below (or appends to a matching batch number).' : 'Adds to on-hand stock. This product is not expiry-tracked, so no batch is needed.'}</span></>}
              {adjustForm.type === 'ADJUSTMENT' && <><PencilSquareIcon className="w-4 h-4 mt-0.5 text-warning shrink-0" /><span>Sets the on-hand quantity to the exact number entered above.</span></>}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setAdjustModal(false)} className="flex-1 border border-border text-fg-muted hover:text-fg hover:bg-surface-2 py-2.5 rounded-lg text-sm font-medium transition-theme">{t('common.cancel')}</button>
            <button
              onClick={() => {
                const f = adjustForm;
                const payload: any = {
                  productId: +f.productId,
                  branchId: +f.branchId,
                  quantity: +f.quantity,
                  type: f.type,
                  notes: f.notes || undefined,
                };
                const usingExistingBatch = !!f.batchId && f.batchId !== 'NEW';
                if (usingExistingBatch) {
                  // Target the chosen batch directly (Stock In credit, or Stock Out
                  // deduction validated against that batch with a 400 if short).
                  payload.batchId = +f.batchId;
                } else if (f.type === 'RECEIPT' && selectedProduct?.tracksExpiry) {
                  // Creating a new batch on Stock In.
                  if (f.manufactureDate) payload.manufactureDate = f.manufactureDate;
                  if (f.expiryDate) payload.expiryDate = f.expiryDate;
                  if (f.batchNumber) payload.batchNumber = f.batchNumber;
                }
                adjustMutation.mutate(payload);
              }}
              disabled={adjustMutation.isPending || !adjustForm.productId || !adjustForm.quantity || overDeduct}
              className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-50 text-accent-fg py-2.5 rounded-lg text-sm font-semibold transition-theme focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {adjustMutation.isPending ? 'Saving…' : t('common.save')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Batch breakdown popup — opens when a grouped row is clicked */}
      <Modal open={!!batchModal} onClose={() => setBatchModal(null)} title={batchModal ? `Batches — ${isRTL ? batchModal.product?.nameAr : batchModal.product?.name}` : 'Batches'} size="lg">
        {batchModal && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <div><span className="text-fg-subtle">SKU:</span> <span className="text-fg nums">{batchModal.product?.sku}</span></div>
              <div><span className="text-fg-subtle">Branch:</span> <span className="text-fg">{isRTL ? batchModal.branch?.nameAr : batchModal.branch?.name}</span></div>
              <div><span className="text-fg-subtle">Total on hand:</span> <span className="font-semibold text-fg nums">{batchModal.quantity} {batchModal.product?.unit?.abbreviation}</span></div>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-2">
                  <tr>
                    <th className="text-start font-semibold text-fg-muted px-3 py-2 text-xs uppercase tracking-wide">Batch / Lot</th>
                    <th className="text-end font-semibold text-fg-muted px-3 py-2 text-xs uppercase tracking-wide">Qty</th>
                    <th className="text-start font-semibold text-fg-muted px-3 py-2 text-xs uppercase tracking-wide">Manufactured</th>
                    <th className="text-start font-semibold text-fg-muted px-3 py-2 text-xs uppercase tracking-wide">Expiry</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {batchModal.batches?.map((b: any, i: number) => (
                    <tr key={b.inventoryId ?? i} className="hover:bg-surface-2">
                      <td className="px-3 py-2 text-fg nums">{b.batchNumber || <span className="text-fg-subtle">Untracked</span>}</td>
                      <td className="px-3 py-2 text-end nums text-fg">{b.quantity}</td>
                      <td className="px-3 py-2 text-fg-muted nums">{b.manufactureDate ? format(new Date(b.manufactureDate), 'MMM d, yyyy') : '—'}</td>
                      <td className="px-3 py-2">
                        {b.expiryDate
                          ? <div className="flex flex-col gap-0.5">
                              <span className={`inline-block w-fit text-xs px-2 py-0.5 rounded-full font-medium nums ${expiryChip(b.expiryDate)}`}>{format(new Date(b.expiryDate), 'MMM d, yyyy')}</span>
                              <span className="text-[11px] text-fg-subtle nums">{remainingLabel(b.expiryDate)}</span>
                            </div>
                          : <span className="text-xs text-fg-subtle">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-fg-subtle">Batches are listed earliest-expiry first — the order they are consumed (FEFO) on stock-out and transfers.</p>
          </div>
        )}
      </Modal>

      <OpeningStockDrawer
        open={importModal}
        onClose={() => setImportModal(false)}
        branches={branches || []}
        products={products || []}
      />
    </div>
  );
}
