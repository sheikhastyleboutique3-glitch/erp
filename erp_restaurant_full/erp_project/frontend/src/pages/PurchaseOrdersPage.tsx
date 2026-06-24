import { useState, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import api, { downloadCsv } from '../lib/api';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import SlideDrawer from '../components/SlideDrawer';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { pdf } from '@react-pdf/renderer';
import { PurchaseOrderPDF } from '../components/PurchaseOrderPDF';

const STATUS_ACTIONS: Record<string, { labelKey: string; next: string; color: string; icon: string }[]> = {
  DRAFT: [
    { labelKey: 'po.sendToSupplier',    next: 'SENT_TO_SUPPLIER',    color: 'bg-blue-600 hover:bg-blue-700',   icon: '📤' },
    { labelKey: 'po.cancelPO',          next: 'CANCELLED',           color: 'bg-red-100 hover:bg-red-200 text-red-700', icon: '✕' },
  ],
  SENT_TO_SUPPLIER: [
    { labelKey: 'po.partiallyReceived', next: 'PARTIALLY_RECEIVED',  color: 'bg-orange-600 hover:bg-orange-700', icon: '📥' },
    { labelKey: 'po.fullyReceived',     next: 'FULLY_RECEIVED',      color: 'bg-green-600 hover:bg-green-700',  icon: '✓' },
    { labelKey: 'po.cancelPO',          next: 'CANCELLED',           color: 'bg-red-100 hover:bg-red-200 text-red-700', icon: '✕' },
  ],
  PARTIALLY_RECEIVED: [
    { labelKey: 'po.fullyReceived',     next: 'FULLY_RECEIVED',      color: 'bg-green-600 hover:bg-green-700',  icon: '✓' },
  ],
};

export default function PurchaseOrdersPage() {
  const { t, i18n } = useTranslation();
  const { user, activeBranch } = useAuth();
  const qc = useQueryClient();
  const canManagePO = ['SUPER_ADMIN', 'PROCUREMENT', 'WAREHOUSE'].includes(user?.role || '');
  const isRTL = i18n.language === 'ar';
  const [selected, setSelected] = useState<any>(null);
  const [statusModal, setStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [pdfLoading, setPdfLoading] = useState<number | null>(null);
  const [createDrawer, setCreateDrawer] = useState(false);
  const [poForm, setPoForm] = useState({ supplierId: '', branchId: '', currency: 'QAR', notes: '', expectedDate: '' });
  const [poItems, setPoItems] = useState<{ productId: string; unitId: string; orderedQty: string; unitPrice: string }[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [searchPO, setSearchPO] = useState('');
  const [supplierFilterPO, setSupplierFilterPO] = useState('');
  const [branchFilterPO, setBranchFilterPO] = useState('');
  const [fromDatePO, setFromDatePO] = useState('');
  const [toDatePO, setToDatePO] = useState('');

  // PO detail / edit / receive drawer state
  const [detailDrawer, setDetailDrawer] = useState(false);
  const [detailPO, setDetailPO] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit' | 'receive'>('view');
  const [editForm, setEditForm] = useState({ supplierId: '', branchId: '', currency: 'QAR', notes: '', expectedDate: '' });
  const [editItems, setEditItems] = useState<{ productId: string; unitId: string; orderedQty: string; unitPrice: string }[]>([]);
  const [receiveItems, setReceiveItems] = useState<Record<number, { receivedQty: string; unitPrice: string; dateReceived: string; manufactureDate: string; expiryDate: string }>>({});
  const [updateCostPrice, setUpdateCostPrice] = useState(false);

  const openDetail = async (poId: number, startMode: 'view' | 'edit' | 'receive' = 'view') => {
    setDetailDrawer(true);
    setDetailLoading(true);
    setMode(startMode);
    try {
      const res = await api.get(`/purchase-orders/${poId}`);
      const full = res.data.data;
      setDetailPO(full);
      setEditForm({
        supplierId: String(full.supplierId || ''),
        branchId: String(full.branchId || ''),
        currency: full.currency || 'QAR',
        notes: full.notes || '',
        expectedDate: full.expectedDate ? full.expectedDate.slice(0, 10) : '',
      });
      setEditItems((full.items || []).map((it: any) => ({
        productId: String(it.productId), unitId: it.unitId ? String(it.unitId) : '',
        orderedQty: String(it.orderedQty), unitPrice: String(it.unitPrice),
      })));
      const rcv: Record<number, { receivedQty: string; unitPrice: string; dateReceived: string; manufactureDate: string; expiryDate: string }> = {};
      const today = new Date().toISOString().slice(0, 10);
      (full.items || []).forEach((it: any) => {
        rcv[it.id] = {
          receivedQty: String(it.receivedQty || it.orderedQty),
          unitPrice: String(it.unitPrice),
          dateReceived: today,
          manufactureDate: '',
          expiryDate: it.expiryDate ? it.expiryDate.slice(0, 10) : '',
        };
      });
      setReceiveItems(rcv);
      setUpdateCostPrice(false);
    } catch {
      toast.error('Failed to load PO');
      setDetailDrawer(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const editTotal = editItems.reduce((s, i) => s + (+i.orderedQty || 0) * (+i.unitPrice || 0), 0);

  const savePOEdit = useMutation({
    mutationFn: () => api.patch(`/purchase-orders/${detailPO.id}`, {
      supplierId: +editForm.supplierId,
      branchId: +editForm.branchId,
      currency: editForm.currency,
      notes: editForm.notes || undefined,
      expectedDate: editForm.expectedDate || undefined,
      items: editItems.filter(i => i.productId).map(i => ({
        productId: +i.productId, unitId: i.unitId ? +i.unitId : undefined,
        orderedQty: +i.orderedQty, unitPrice: +i.unitPrice,
      })),
    }),
    onSuccess: (res) => {
      toast.success('PO updated');
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['po-stats'] });
      setDetailPO(res.data.data); setMode('view');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const receivePO = useMutation({
    mutationFn: () => api.patch(`/purchase-orders/${detailPO.id}/receive`, {
      items: Object.entries(receiveItems).map(([itemId, v]) => ({
        itemId: +itemId, receivedQty: +v.receivedQty || 0,
        unitPrice: v.unitPrice === '' ? undefined : +v.unitPrice,
        dateReceived: v.dateReceived || undefined,
        manufactureDate: v.manufactureDate || undefined,
        expiryDate: v.expiryDate || undefined,
      })),
      updateCostPrice,
    }),
    onSuccess: (res) => {
      toast.success('Items received ✓');
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['po-stats'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setDetailPO(res.data.data); setMode('view');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const buildPOParams = () => {
    const params: any = {};
    if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
    if (searchPO) params.search = searchPO;
    if (supplierFilterPO) params.supplierId = supplierFilterPO;
    if (branchFilterPO) params.branchId = branchFilterPO;
    else if (activeBranch?.id) params.branchId = activeBranch.id;
    if (fromDatePO) params.from = fromDatePO;
    if (toDatePO) params.to = toDatePO;
    return params;
  };

  const { data: pos, isLoading } = useQuery({
    queryKey: ['purchase-orders', statusFilter, searchPO, supplierFilterPO, branchFilterPO, activeBranch?.id, fromDatePO, toDatePO],
    queryFn: () => api.get('/purchase-orders', { params: buildPOParams() }).then(r => r.data.data),
    staleTime: 0,
    refetchInterval: 30000,
  });
  const { data: poStats } = useQuery({ queryKey: ['po-stats'], queryFn: () => api.get('/reports/purchase-order-stats').then(r => r.data.data), staleTime: 0 });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings').then(r => r.data.data) });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: () => api.get('/suppliers').then(r => r.data.data) });
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: () => api.get('/branches').then(r => r.data.data) });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => api.get('/products').then(r => r.data.data) });
  const { data: units } = useQuery({ queryKey: ['units'], queryFn: () => api.get('/units').then(r => r.data.data) });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/purchase-orders', data),
    onSuccess: () => {
      toast.success(t('po.createPO'));
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['po-stats'] });
      setCreateDrawer(false);
      setPoForm({ supplierId: '', branchId: '', currency: 'QAR', notes: '', expectedDate: '' });
      setPoItems([]);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const addPoItem = () => setPoItems(p => [...p, { productId: '', unitId: '', orderedQty: '1', unitPrice: '0' }]);
  const removePoItem = (i: number) => setPoItems(p => p.filter((_, idx) => idx !== i));
  const updatePoItem = (i: number, field: string, val: string) => setPoItems(p => p.map((item, idx) => idx === i ? { ...item, [field]: val } : item));

  const handleCreatePO = () => {
    if (!poForm.supplierId || !poForm.branchId) { toast.error(t('po.supplierRequired')); return; }
    if (!poItems.length) { toast.error(t('po.addAtLeastOne')); return; }
    createMutation.mutate({
      supplierId: +poForm.supplierId,
      branchId: +poForm.branchId,
      currency: poForm.currency,
      notes: poForm.notes || undefined,
      expectedDate: poForm.expectedDate || undefined,
      items: poItems.map(i => ({ productId: +i.productId, unitId: i.unitId ? +i.unitId : undefined, orderedQty: +i.orderedQty, unitPrice: +i.unitPrice })),
    });
  };

  const settingsMap: Record<string, string> = {};
  settings?.forEach((s: any) => { settingsMap[s.key] = s.value; });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: any) => api.patch(`/purchase-orders/${id}/status`, { status }),
    onSuccess: () => {
      toast.success('PO updated');
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['po-stats'] });
      setStatusModal(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const handleQuickAction = (po: any, nextStatus: string) => {
    // Receiving must go through the receive form so quantities & prices can be entered.
    if (nextStatus === 'PARTIALLY_RECEIVED' || nextStatus === 'FULLY_RECEIVED') {
      openDetail(po.id, 'receive');
      return;
    }
    if (nextStatus === 'CANCELLED' && !confirm('Are you sure you want to cancel this PO?')) return;
    updateStatus.mutate({ id: po.id, status: nextStatus });
  };

  const handleDownloadPDF = async (po: any) => {
    setPdfLoading(po.id);
    try {
      // 1. Fetch full PO detail (items with product.allergens, supplier, branch, requisition)
      const poRes = await api.get(`/purchase-orders/${po.id}`);
      const fullPO = poRes.data.data;
      if (!fullPO) throw new Error('PO data not found');

      // 2. Fetch FRESH settings at click time — ensures latest admin panel customization
      //    is always reflected in the PDF, even if the page cache is stale.
      //    We fetch ALL settings (no group filter) so both company_* and invoice_* keys
      //    are available in one map.
      const settingsRes = await api.get('/settings');
      const freshSettingsMap: Record<string, string> = {};
      settingsRes.data.data?.forEach((s: any) => { freshSettingsMap[s.key] = s.value; });

      // 3. Generate PDF blob — Helvetica default, 30s timeout
      const pdfDoc = <PurchaseOrderPDF po={fullPO} settings={freshSettingsMap} />;
      const blobPromise = pdf(pdfDoc).toBlob();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('PDF generation timed out after 30 seconds')), 30000)
      );
      const blob = await Promise.race([blobPromise, timeoutPromise]) as Blob;

      // 4. Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PO-${fullPO.poNumber || po.poNumber}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`✅ Downloaded PO-${fullPO.poNumber}.pdf`);
    } catch (e: any) {
      console.error('PDF generation error:', e);
      const msg = e?.message || 'PDF generation failed';
      toast.error(`❌ PDF: ${msg}`);
    } finally {
      setPdfLoading(null);
    }
  };

  const PO_STATUSES = ['DRAFT', 'SENT_TO_SUPPLIER', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CANCELLED'];

  const clearPOFilters = () => { setSearchPO(''); setSupplierFilterPO(''); setBranchFilterPO(''); setFromDatePO(''); setToDatePO(''); };
  const hasActivePOFilters = searchPO || supplierFilterPO || branchFilterPO || fromDatePO || toDatePO;

  return (
    <div>
      <PageHeader
        title={t('nav.purchaseOrders')}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => setCreateDrawer(true)}
              className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-medium"
            >
              {t('po.newPO')}
            </button>
            <button
              onClick={async () => {
                try {
                  const params = new URLSearchParams();
                  if (branchFilterPO) params.set('branchId', branchFilterPO);
                  else if (activeBranch?.id) params.set('branchId', String(activeBranch.id));
                  if (fromDatePO) params.set('from', fromDatePO);
                  if (toDatePO) params.set('to', toDatePO);
                  // Carry the on-screen filters into the export so the CSV matches the table.
                  if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
                  if (searchPO) params.set('search', searchPO);
                  if (supplierFilterPO) params.set('supplierId', supplierFilterPO);
                  const qs = params.toString();
                  await downloadCsv(
                    `/reports/export/purchase-orders/csv${qs ? `?${qs}` : ''}`,
                    `purchase-orders-${new Date().toISOString().slice(0, 10)}.csv`,
                  );
                } catch { toast.error('Export failed'); }
              }}
              className="bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50"
            >
              📊 {t('po.exportCsv')}
            </button>
          </div>
        }
      />

      {/* Stats Cards */}
      {poStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <p className="text-xs text-gray-500">{t('po.totalPOs')}</p>
            <p className="text-xl font-bold text-gray-900">{poStats.total}</p>
          </div>
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">{t('po.draft')}</p>
            <p className="text-xl font-bold text-gray-600">{poStats.draft}</p>
          </div>
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-3">
            <p className="text-xs text-blue-600">{t('po.sent')}</p>
            <p className="text-xl font-bold text-blue-700">{poStats.sent}</p>
          </div>
          <div className="bg-orange-50 rounded-xl border border-orange-200 p-3">
            <p className="text-xs text-orange-600">{t('po.partial')}</p>
            <p className="text-xl font-bold text-orange-700">{poStats.partiallyReceived}</p>
          </div>
          <div className="bg-green-50 rounded-xl border border-green-200 p-3">
            <p className="text-xs text-green-600">{t('po.received')}</p>
            <p className="text-xl font-bold text-green-700">{poStats.fullyReceived}</p>
          </div>
          <div className="bg-purple-50 rounded-xl border border-purple-200 p-3">
            <p className="text-xs text-purple-600">{t('po.pendingValue')}</p>
            <p className="text-lg font-bold text-purple-700">QAR {poStats.pendingValue?.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 start-3 flex items-center text-gray-400">🔍</span>
          <input value={searchPO} onChange={e => setSearchPO(e.target.value)} placeholder={t('po.searchPO')} className="w-full ps-9 pe-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border ${
          showFilters || hasActivePOFilters ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}>
          ⚙️ {t('common.filter')} {hasActivePOFilters && <span className="bg-brand-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{[searchPO, supplierFilterPO, branchFilterPO, fromDatePO, toDatePO].filter(Boolean).length}</span>}
        </button>
      </div>

      {showFilters && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">⚙️ {t('po.advancedFilters')}</p>
            {hasActivePOFilters && <button onClick={clearPOFilters} className="text-xs text-red-500 hover:text-red-700">{t('po.clearAll')}</button>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('po.supplier')}</label>
              <select value={supplierFilterPO} onChange={e => setSupplierFilterPO(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                <option value="">{t('po.allSuppliers')}</option>
                {suppliers?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('common.branch')}</label>
              <select value={branchFilterPO} onChange={e => setBranchFilterPO(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                <option value="">{t('po.allBranches')}</option>
                {branches?.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('po.fromDate')}</label>
              <input type="date" value={fromDatePO} onChange={e => setFromDatePO(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('po.toDate')}</label>
              <input type="date" value={toDatePO} onChange={e => setToDatePO(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
      )}

      {/* Status Filter */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        <button
          onClick={() => setStatusFilter('all')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium ${
            statusFilter === 'all' ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {t('common.all')} ({pos?.length || 0})
        </button>
        {PO_STATUSES.map(status => {
          const count = pos?.filter((po: any) => po.status === status).length || 0;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium ${
                statusFilter === status ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {status.replace(/_/g, ' ')} ({count})
            </button>
          );
        })}
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">PO #</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('po.supplier')}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('common.branch')}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('common.status')}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('common.date')}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pos?.map((po: any) => {
                  const actions = STATUS_ACTIONS[po.status] || [];
                  return (
                    <tr key={po.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-bold text-brand-700"><button onClick={() => openDetail(po.id, 'view')} className="hover:underline">{po.poNumber}</button></td>
                      <td className="px-4 py-3 text-sm text-gray-700">{po.supplier?.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{isRTL ? po.branch?.nameAr : po.branch?.name}</td>
                      <td className="px-4 py-3 text-sm font-semibold">{po.currency} {po.totalAmount.toFixed(2)}</td>
                      <td className="px-4 py-3"><StatusBadge status={po.status} size="sm" /></td>
                      <td className="px-4 py-3 text-xs text-gray-400">{format(new Date(po.createdAt), 'MMM d, yyyy')}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            onClick={() => openDetail(po.id, 'view')}
                            className="text-xs bg-brand-50 hover:bg-brand-100 text-brand-700 px-2 py-1 rounded-lg font-medium"
                          >
                            👁 {t('common.view') !== 'common.view' ? t('common.view') : 'View'}
                          </button>
                          {canManagePO && !['FULLY_RECEIVED', 'CANCELLED'].includes(po.status) && (
                            <button
                              onClick={() => openDetail(po.id, 'receive')}
                              className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded-lg font-medium"
                            >
                              📥 {t('po.receive') !== 'po.receive' ? t('po.receive') : 'Receive'}
                            </button>
                          )}
                          {actions.map(action => (
                            <button
                              key={action.next}
                              onClick={() => handleQuickAction(po, action.next)}
                              disabled={updateStatus.isPending}
                              className={`text-xs px-2 py-1 rounded-lg font-medium disabled:opacity-50 ${
                                action.color.includes('text-') ? action.color : `${action.color} text-white`
                              }`}
                              title={t(action.labelKey)}
                            >
                              {action.icon} {t(action.labelKey)}
                            </button>
                          ))}
                          <button
                            onClick={() => handleDownloadPDF(po)}
                            disabled={pdfLoading === po.id}
                            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded-lg font-medium disabled:opacity-50"
                          >
                            {pdfLoading === po.id ? '⏳' : '📄'} {t('po.downloadPDF')}
                          </button>
                          {!['FULLY_RECEIVED', 'CANCELLED'].includes(po.status) && (
                            <button
                              onClick={() => { setSelected(po); setNewStatus(po.status); setStatusModal(true); }}
                              className="text-xs text-gray-500 hover:text-gray-700 px-1"
                              title="More options"
                            >
                              ⋯
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!pos?.length && (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">{t('common.noData')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PO Detail / Edit / Receive Drawer */}
      <SlideDrawer open={detailDrawer} onClose={() => setDetailDrawer(false)} title={detailPO ? `${mode === 'edit' ? '✏️ ' : mode === 'receive' ? '📥 ' : '📄 '}${detailPO.poNumber}` : 'Purchase Order'} width="w-[680px]">
        {detailLoading || !detailPO ? <LoadingSpinner /> : (
          <div className="space-y-5">
            {/* Header summary */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-gray-500">{t('po.supplier')}</p><p className="font-medium text-gray-900">{detailPO.supplier?.name}</p></div>
              <div><p className="text-xs text-gray-500">{t('common.branch')}</p><p className="font-medium text-gray-900">{isRTL ? detailPO.branch?.nameAr : detailPO.branch?.name}</p></div>
              <div><p className="text-xs text-gray-500">{t('common.status')}</p><StatusBadge status={detailPO.status} size="sm" /></div>
              <div><p className="text-xs text-gray-500">{t('common.date')}</p><p className="font-medium text-gray-900">{format(new Date(detailPO.createdAt), 'MMM d, yyyy')}</p></div>
              {detailPO.expectedDate && <div><p className="text-xs text-gray-500">{t('po.expectedDelivery')}</p><p className="font-medium text-gray-900">{format(new Date(detailPO.expectedDate), 'MMM d, yyyy')}</p></div>}
              {detailPO.receivedDate && <div><p className="text-xs text-gray-500">{t('po.received')}</p><p className="font-medium text-gray-900">{format(new Date(detailPO.receivedDate), 'MMM d, yyyy')}</p></div>}
              {detailPO.notes && <div className="col-span-2"><p className="text-xs text-gray-500">{t('po.notes')}</p><p className="text-gray-700">{detailPO.notes}</p></div>}
            </div>

            {/* VIEW MODE — items table + grand total */}
            {mode === 'view' && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('po.lineItems')}</p>
                {(() => {
                  const items = detailPO.items || [];
                  const total = items.length;
                  const fully = items.filter((it: any) => (it.receivedQty || 0) >= (it.orderedQty || 0) && (it.orderedQty || 0) > 0).length;
                  const partial = items.filter((it: any) => (it.receivedQty || 0) > 0 && (it.receivedQty || 0) < (it.orderedQty || 0)).length;
                  const pendingLines = total - fully - partial;
                  // Only show the progress banner while a receipt is in progress.
                  if (detailPO.status !== 'PARTIALLY_RECEIVED' || total === 0) return null;
                  const pct = Math.round((fully / total) * 100);
                  return (
                    <div className="mb-3 p-3 bg-orange-50 border border-orange-100 rounded-xl">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold text-orange-800">
                          {fully} of {total} line(s) fully received
                          {partial > 0 ? ` · ${partial} partial` : ''}
                          {pendingLines > 0 ? ` · ${pendingLines} pending` : ''}
                        </p>
                        <span className="text-xs font-semibold text-orange-700">{pct}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-orange-100 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="text-start px-3 py-2">{t('po.product') !== 'po.product' ? t('po.product') : 'Product'}</th>
                        <th className="text-center px-3 py-2">{t('po.ordered') !== 'po.ordered' ? t('po.ordered') : 'Ordered'}</th>
                        <th className="text-center px-3 py-2">{t('po.received') !== 'po.received' ? t('po.received') : 'Received'}</th>
                        <th className="text-center px-3 py-2">{t('po.pending') !== 'po.pending' ? t('po.pending') : 'Pending'}</th>
                        <th className="text-center px-3 py-2">{t('po.lineStatus') !== 'po.lineStatus' ? t('po.lineStatus') : 'Status'}</th>
                        <th className="text-end px-3 py-2">{t('po.unitPrice') !== 'po.unitPrice' ? t('po.unitPrice') : 'Unit Price'}</th>
                        <th className="text-end px-3 py-2">{t('po.lineTotal') !== 'po.lineTotal' ? t('po.lineTotal') : 'Line Total'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {detailPO.items?.map((it: any) => {
                        const ordered = it.orderedQty || 0;
                        const received = it.receivedQty || 0;
                        const pending = Math.max(0, ordered - received);
                        const state = received >= ordered && ordered > 0 ? 'received' : received > 0 ? 'partial' : 'pending';
                        const chip = state === 'received'
                          ? 'bg-green-100 text-green-700'
                          : state === 'partial'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-gray-100 text-gray-600';
                        const chipLabel = state === 'received'
                          ? (t('po.received') !== 'po.received' ? t('po.received') : 'Received')
                          : state === 'partial'
                            ? (t('po.partial') !== 'po.partial' ? t('po.partial') : 'Partial')
                            : (t('po.pending') !== 'po.pending' ? t('po.pending') : 'Pending');
                        return (
                          <tr key={it.id}>
                            <td className="px-3 py-2 text-gray-800">{isRTL ? it.product?.nameAr : it.product?.name} <span className="text-gray-400 text-xs">{it.unit?.abbreviation || ''}</span></td>
                            <td className="px-3 py-2 text-center text-gray-700">{ordered}</td>
                            <td className="px-3 py-2 text-center text-gray-700">{received}</td>
                            <td className={`px-3 py-2 text-center font-medium ${pending > 0 ? 'text-orange-600' : 'text-gray-400'}`}>{pending}</td>
                            <td className="px-3 py-2 text-center"><span className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-medium ${chip}`}>{chipLabel}</span></td>
                            <td className="px-3 py-2 text-end text-gray-700">{detailPO.currency} {it.unitPrice.toFixed(2)}</td>
                            <td className="px-3 py-2 text-end font-medium text-gray-900">{detailPO.currency} {(ordered * it.unitPrice).toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-semibold">
                        <td className="px-3 py-2.5" colSpan={6}>{t('po.total') !== 'po.total' ? t('po.total') : 'Total'}</td>
                        <td className="px-3 py-2.5 text-end text-brand-700">{detailPO.currency} {detailPO.totalAmount.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {canManagePO && !['FULLY_RECEIVED', 'CANCELLED'].includes(detailPO.status) && (
                  <div className="flex gap-3 mt-4">
                    <button onClick={() => setMode('edit')} className="flex-1 border border-brand-200 text-brand-700 bg-brand-50 hover:bg-brand-100 py-2.5 rounded-xl text-sm font-medium">✏️ {t('common.edit') !== 'common.edit' ? t('common.edit') : 'Edit'}</button>
                    <button onClick={() => setMode('receive')} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl text-sm font-medium">📥 {t('po.receive') !== 'po.receive' ? t('po.receive') : 'Receive Items'}</button>
                  </div>
                )}
              </div>
            )}

            {/* EDIT MODE */}
            {mode === 'edit' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">{t('po.supplier')}</label>
                    <select value={editForm.supplierId} onChange={e => setEditForm(p => ({ ...p, supplierId: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                      {suppliers?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">{t('common.branch')}</label>
                    <select value={editForm.branchId} onChange={e => setEditForm(p => ({ ...p, branchId: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                      {branches?.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">{t('po.currency')}</label>
                    <select value={editForm.currency} onChange={e => setEditForm(p => ({ ...p, currency: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                      {['QAR', 'USD', 'EUR', 'AED', 'SAR'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">{t('po.expectedDelivery')}</label>
                    <input type="date" value={editForm.expectedDate} onChange={e => setEditForm(p => ({ ...p, expectedDate: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                  </div>
                  <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">{t('po.notes')}</label>
                    <textarea value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('po.lineItems')}</p>
                    <button onClick={() => setEditItems(p => [...p, { productId: '', unitId: '', orderedQty: '1', unitPrice: '0' }])} className="text-xs text-brand-600 font-medium hover:underline">{t('po.addItem')}</button>
                  </div>
                  <div className="space-y-2">
                    {editItems.map((item, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-xl p-2">
                        <div className="col-span-4">
                          <select value={item.productId} onChange={e => {
                            const prod = products?.find((p: any) => p.id === +e.target.value);
                            setEditItems(p => p.map((it, idx) => idx === i ? { ...it, productId: e.target.value, unitId: prod?.unitId?.toString() || it.unitId, unitPrice: prod ? (prod.costPrice?.toString() || '0') : it.unitPrice } : it));
                          }} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs">
                            <option value="">Product</option>
                            {products?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <select value={item.unitId} onChange={e => setEditItems(p => p.map((it, idx) => idx === i ? { ...it, unitId: e.target.value } : it))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs">
                            <option value="">Unit</option>
                            {units?.map((u: any) => <option key={u.id} value={u.id}>{u.abbreviation}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <input type="number" min={0} step="any" value={item.orderedQty} onChange={e => setEditItems(p => p.map((it, idx) => idx === i ? { ...it, orderedQty: e.target.value } : it))} placeholder="Qty" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center" />
                        </div>
                        <div className="col-span-3">
                          <input type="number" min={0} step="any" value={item.unitPrice} onChange={e => setEditItems(p => p.map((it, idx) => idx === i ? { ...it, unitPrice: e.target.value } : it))} placeholder="Price" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-end" />
                        </div>
                        <div className="col-span-1 text-center">
                          <button onClick={() => setEditItems(p => p.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 text-sm">×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="text-end mt-2"><span className="text-sm font-semibold text-gray-900">{t('po.total') !== 'po.total' ? t('po.total') : 'Total'}: {editForm.currency} {editTotal.toFixed(2)}</span></div>
                </div>
                <div className="flex gap-3 pt-2 border-t border-gray-100">
                  <button onClick={() => setMode('view')} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium">{t('common.cancel')}</button>
                  <button onClick={() => savePOEdit.mutate()} disabled={savePOEdit.isPending} className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white py-2.5 rounded-xl text-sm font-semibold">{savePOEdit.isPending ? t('common.saving') : t('common.save')}</button>
                </div>
              </div>
            )}

            {/* RECEIVE MODE */}
            {mode === 'receive' && (
              <div className="space-y-4">
                <p className="text-xs text-gray-500">{t('po.receiveHint') !== 'po.receiveHint' ? t('po.receiveHint') : 'Enter the actual received quantity and unit price. Price changes are recorded in price history.'}</p>
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="text-start px-3 py-2">{t('po.product') !== 'po.product' ? t('po.product') : 'Product'}</th>
                        <th className="text-center px-3 py-2">{t('po.ordered') !== 'po.ordered' ? t('po.ordered') : 'Ordered'}</th>
                        <th className="text-center px-3 py-2 w-24">{t('po.received') !== 'po.received' ? t('po.received') : 'Received'}</th>
                        <th className="text-end px-3 py-2 w-28">{t('po.unitPrice') !== 'po.unitPrice' ? t('po.unitPrice') : 'Unit Price'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {detailPO.items?.map((it: any) => (
                        <Fragment key={it.id}>
                        <tr>
                          <td className="px-3 py-2 text-gray-800">{isRTL ? it.product?.nameAr : it.product?.name}<br/><span className="text-gray-400 text-xs">{t('po.was') !== 'po.was' ? t('po.was') : 'cost'}: {detailPO.currency} {(it.product?.costPrice ?? 0).toFixed(2)}</span></td>
                          <td className="px-3 py-2 text-center text-gray-500">{it.orderedQty}</td>
                          <td className="px-3 py-2">
                            <input type="number" min={0} step="any" value={receiveItems[it.id]?.receivedQty ?? ''} onChange={e => setReceiveItems(p => ({ ...p, [it.id]: { ...p[it.id], receivedQty: e.target.value } }))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min={0} step="any" value={receiveItems[it.id]?.unitPrice ?? ''} onChange={e => setReceiveItems(p => ({ ...p, [it.id]: { ...p[it.id], unitPrice: e.target.value } }))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-end" />
                          </td>
                        </tr>
                        {/* Batch expiry intake (Requirement #4) — only when the item tracks expiry */}
                        {it.product?.tracksExpiry && (
                          <tr className="bg-amber-50/40">
                            <td colSpan={4} className="px-3 pb-3 pt-1">
                              {it.product?.expiryTrackingType === 'SHELF_LIFE_DAYS' ? (
                                <div className="flex flex-wrap items-end gap-3">
                                  <div>
                                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Date Received</label>
                                    <input type="date" value={receiveItems[it.id]?.dateReceived ?? ''} onChange={e => setReceiveItems(p => ({ ...p, [it.id]: { ...p[it.id], dateReceived: e.target.value } }))} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
                                  </div>
                                  <p className="text-[11px] text-gray-500 pb-2">
                                    + {it.product?.shelfLifeDays ?? '?'} shelf-life days →
                                    <span className="font-medium text-gray-700"> Expiry: {
                                      receiveItems[it.id]?.dateReceived && it.product?.shelfLifeDays
                                        ? new Date(new Date(receiveItems[it.id].dateReceived).getTime() + it.product.shelfLifeDays * 86400000).toISOString().slice(0, 10)
                                        : '—'
                                    }</span>
                                  </p>
                                </div>
                              ) : (
                                <div className="flex flex-wrap items-end gap-3">
                                  <div>
                                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Manufacture Date</label>
                                    <input type="date" value={receiveItems[it.id]?.manufactureDate ?? ''} onChange={e => setReceiveItems(p => ({ ...p, [it.id]: { ...p[it.id], manufactureDate: e.target.value } }))} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Expiry Date <span className="text-red-500">*</span></label>
                                    <input type="date" value={receiveItems[it.id]?.expiryDate ?? ''} onChange={e => setReceiveItems(p => ({ ...p, [it.id]: { ...p[it.id], expiryDate: e.target.value } }))} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={updateCostPrice} onChange={e => setUpdateCostPrice(e.target.checked)} className="rounded border-gray-300" />
                  {t('po.updateCostPrice') !== 'po.updateCostPrice' ? t('po.updateCostPrice') : 'Update product master cost price with received price'}
                </label>
                <div className="flex gap-3 pt-2 border-t border-gray-100">
                  <button onClick={() => setMode('view')} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium">{t('common.cancel')}</button>
                  <button onClick={() => receivePO.mutate()} disabled={receivePO.isPending} className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white py-2.5 rounded-xl text-sm font-semibold">{receivePO.isPending ? t('common.saving') : `📥 ${t('po.confirmReceive') !== 'po.confirmReceive' ? t('po.confirmReceive') : 'Confirm Receipt'}`}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </SlideDrawer>

      {/* Create PO Drawer */}
      <SlideDrawer open={createDrawer} onClose={() => setCreateDrawer(false)} title={`📝 ${t('po.newPO')}`} width="w-[620px]">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('po.supplier')} *</label>
              <select value={poForm.supplierId} onChange={e => setPoForm(p => ({ ...p, supplierId: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                <option value="">{t('po.allSuppliers')}</option>
                {suppliers?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('po.deliveryBranch')} *</label>
              <select value={poForm.branchId} onChange={e => setPoForm(p => ({ ...p, branchId: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                <option value="">{t('po.allBranches')}</option>
                {branches?.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('po.currency')}</label>
              <select value={poForm.currency} onChange={e => setPoForm(p => ({ ...p, currency: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                {['QAR', 'USD', 'EUR', 'AED', 'SAR'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('po.expectedDelivery')}</label>
              <input type="date" value={poForm.expectedDate} onChange={e => setPoForm(p => ({ ...p, expectedDate: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('po.notes')}</label>
              <textarea value={poForm.notes} onChange={e => setPoForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('po.lineItems')}</p>
              <button onClick={addPoItem} className="text-xs text-brand-600 font-medium hover:underline">{t('po.addItem')}</button>
            </div>
            {poItems.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-xl">{t('po.noItemsYet')}</p>
            )}
            <div className="space-y-2">
              {poItems.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-xl p-2">
                  <div className="col-span-4">
                    <select
                      value={item.productId}
                      onChange={e => {
                        const prod = products?.find((p: any) => p.id === +e.target.value);
                        updatePoItem(i, 'productId', e.target.value);
                        if (prod) {
                          updatePoItem(i, 'unitId', prod.unitId?.toString() || '');
                          updatePoItem(i, 'unitPrice', prod.costPrice?.toString() || '0');
                        }
                      }}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                    >
                      <option value="">Product</option>
                      {products?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <select value={item.unitId} onChange={e => updatePoItem(i, 'unitId', e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs">
                      <option value="">Unit</option>
                      {units?.map((u: any) => <option key={u.id} value={u.id}>{u.abbreviation}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input type="number" min={0} step="any" value={item.orderedQty} onChange={e => updatePoItem(i, 'orderedQty', e.target.value)} placeholder="Qty" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center" />
                  </div>
                  <div className="col-span-3">
                    <input type="number" min={0} step={0.01} value={item.unitPrice} onChange={e => updatePoItem(i, 'unitPrice', e.target.value)} placeholder="Unit Price" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-end" />
                  </div>
                  <div className="col-span-1 text-center">
                    <button onClick={() => removePoItem(i)} className="text-red-400 hover:text-red-600 text-sm">×</button>
                  </div>
                </div>
              ))}
            </div>
            {poItems.length > 0 && (
              <div className="text-end mt-2">
                <span className="text-sm font-semibold text-gray-900">
                  Total: {poForm.currency} {poItems.reduce((s, i) => s + (+i.orderedQty || 0) * (+i.unitPrice || 0), 0).toFixed(2)}
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button onClick={() => setCreateDrawer(false)} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium">{t('common.cancel')}</button>
            <button onClick={handleCreatePO} disabled={createMutation.isPending} className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white py-2.5 rounded-xl text-sm font-semibold">
              {createMutation.isPending ? t('common.creating') : `✅ ${t('po.createPO')}`}
            </button>
          </div>
        </div>
      </SlideDrawer>

      <Modal open={statusModal} onClose={() => setStatusModal(false)} title={`Update PO: ${selected?.poNumber}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.status')}</label>
            <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
              {PO_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStatusModal(false)} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium">{t('common.cancel')}</button>
            <button onClick={() => updateStatus.mutate({ id: selected?.id, status: newStatus })} disabled={updateStatus.isPending} className="flex-1 bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-xl text-sm font-medium">{updateStatus.isPending ? t('common.updating') : t('common.save')}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
