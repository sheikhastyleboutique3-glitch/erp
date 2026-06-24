import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import api, { downloadCsv } from '../lib/api';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const REASONS = ['EXPIRED', 'DAMAGED', 'SPILLAGE', 'OVERPRODUCTION', 'QUALITY_REJECTION', 'OTHER'];

export default function WastagePage() {
  const { t, i18n } = useTranslation();
  const { activeBranch } = useAuth();
  const qc = useQueryClient();
  const isRTL = i18n.language === 'ar';
  const [modal, setModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState({
    productId: '', branchId: activeBranch?.id?.toString() || '',
    quantity: '', reason: 'EXPIRED', notes: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const buildParams = () => {
    const params: any = {};
    if (activeBranch?.id) params.branchId = activeBranch.id;
    if (search) params.search = search;
    if (reasonFilter) params.reason = reasonFilter;
    if (productFilter) params.productId = productFilter;
    if (fromDate) params.from = fromDate;
    if (toDate) params.to = toDate;
    return params;
  };

  const { data: wastage, isLoading } = useQuery({
    queryKey: ['wastage', activeBranch?.id, search, reasonFilter, productFilter, fromDate, toDate],
    queryFn: () => api.get('/wastage', { params: buildParams() }).then(r => r.data.data),
  });

  const { data: products } = useQuery({ queryKey: ['products-list'], queryFn: () => api.get('/products').then(r => r.data.data) });

  const logMutation = useMutation({
    mutationFn: (data: any) => api.post('/wastage', data),
    onSuccess: () => { toast.success('Wastage logged'); qc.invalidateQueries({ queryKey: ['wastage'] }); setModal(false); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (activeBranch?.id) params.set('branchId', String(activeBranch.id));
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      // Carry the on-screen filters into the export so the CSV matches the table.
      if (search) params.set('search', search);
      if (reasonFilter) params.set('reason', reasonFilter);
      if (productFilter) params.set('productId', productFilter);
      const qs = params.toString();
      await downloadCsv(`/reports/export/wastage/csv${qs ? `?${qs}` : ''}`, `wastage-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => { setSearch(''); setReasonFilter(''); setProductFilter(''); setFromDate(''); setToDate(''); };
  const hasActiveFilters = search || reasonFilter || productFilter || fromDate || toDate;

  return (
    <div>
      <PageHeader
        title={t('wastage.title')}
        actions={
          <div className="flex gap-2">
            <button onClick={() => setModal(true)} className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-medium">+ {t('wastage.log')}</button>
            <button onClick={handleExport} disabled={exporting} className="bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
              {exporting ? 'Exporting...' : '📊 Export CSV'}
            </button>
          </div>
        }
      />

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 start-3 flex items-center text-gray-400">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product name or SKU..." className="w-full ps-9 pe-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border ${
          showFilters || hasActiveFilters ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}>
          ⚙️ Filters {hasActiveFilters && <span className="bg-brand-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{[search, reasonFilter, productFilter, fromDate, toDate].filter(Boolean).length}</span>}
        </button>
      </div>

      {showFilters && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">⚙️ Advanced Filters</p>
            {hasActiveFilters && <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-700">Clear All</button>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Reason</label>
              <select value={reasonFilter} onChange={e => setReasonFilter(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                <option value="">All Reasons</option>
                {REASONS.map(r => <option key={r} value={r}>{t(`wastage.reasons.${r}`)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Product</label>
              <select value={productFilter} onChange={e => setProductFilter(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                <option value="">All Products</option>
                {products?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">From Date</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To Date</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
      )}

      {isLoading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Product</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('common.branch')}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('inventory.quantity')}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('wastage.reason')}</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('common.date')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {wastage?.map((w: any) => (
                  <tr key={w.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{isRTL ? w.product?.nameAr : w.product?.name}</p>
                      <p className="text-xs text-gray-400">{w.product?.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{isRTL ? w.branch?.nameAr : w.branch?.name}</td>
                    <td className="px-4 py-3 text-sm font-bold text-red-600">
                      {w.quantity} <span className="text-xs text-gray-400">{w.unit?.abbreviation}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{t(`wastage.reasons.${w.reason}`)}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{format(new Date(w.createdAt), 'MMM d, HH:mm')}</td>
                  </tr>
                ))}
                {!wastage?.length && (
                  <tr><td colSpan={5} className="text-center py-12 text-gray-400">{t('common.noData')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={t('wastage.log')} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
              <select value={form.productId} onChange={e => setForm(p => ({ ...p, productId: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                <option value="">Select</option>
                {products?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('inventory.quantity')}</label>
              <input type="number" min={0} value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('wastage.reason')}</label>
              <select value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                {REASONS.map(r => <option key={r} value={r}>{t(`wastage.reasons.${r}`)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModal(false)} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium">{t('common.cancel')}</button>
            <button
              onClick={() => logMutation.mutate({ ...form, productId: +form.productId, branchId: +(form.branchId || activeBranch?.id || 0), quantity: +form.quantity })}
              disabled={logMutation.isPending || !form.productId || !form.quantity}
              className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white py-2.5 rounded-xl text-sm font-medium"
            >
              {logMutation.isPending ? 'Saving...' : t('common.save')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
