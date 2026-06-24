import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';
import type { SupplierPriceHistory } from '../types';

export default function SuppliersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', nameAr: '', contactName: '', email: '', phone: '', address: '', paymentTerms: '' });
  const [searchQuery, setSearchQuery] = useState('');

  // Price history state
  const [historyModal, setHistoryModal] = useState(false);
  const [historySupplier, setHistorySupplier] = useState<any>(null);
  const [historyProductFilter, setHistoryProductFilter] = useState<string>('');

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.get('/suppliers').then(r => r.data.data),
  });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings').then(r => r.data.data) });
  const cur = (settings?.find((s: any) => s.key === 'default_currency')?.value) || 'QAR';

  const { data: priceHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['supplier-price-history', historySupplier?.id, historyProductFilter],
    queryFn: () => {
      const params = historyProductFilter ? `?productId=${historyProductFilter}` : '';
      return api.get(`/suppliers/${historySupplier.id}/price-history${params}`).then(r => r.data.data);
    },
    enabled: !!historySupplier?.id && historyModal,
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => editing
      ? api.patch(`/suppliers/${editing.id}`, data)
      : api.post('/suppliers', data),
    onSuccess: () => { toast.success(editing ? 'Updated' : 'Created'); qc.invalidateQueries({ queryKey: ['suppliers'] }); setModal(false); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const openEdit = (s: any) => {
    setEditing(s);
    setForm({ name: s.name, nameAr: s.nameAr || '', contactName: s.contactName || '', email: s.email || '', phone: s.phone || '', address: s.address || '', paymentTerms: s.paymentTerms || '' });
    setModal(true);
  };
  const openNew = () => {
    setEditing(null);
    setForm({ name: '', nameAr: '', contactName: '', email: '', phone: '', address: '', paymentTerms: '' });
    setModal(true);
  };

  const openHistory = (s: any) => {
    setHistorySupplier(s);
    setHistoryProductFilter('');
    setHistoryModal(true);
  };

  // Get unique products from price history for filter dropdown
  const uniqueProducts = priceHistory
    ? Array.from(
        new Map(
          (priceHistory as SupplierPriceHistory[]).map((h) => [h.productId, h.product])
        ).values()
      )
    : [];

  return (
    <div>
      <PageHeader
        title={t('nav.suppliers')}
        actions={
          <button onClick={openNew} className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
            + Add Supplier
          </button>
        }
      />

      {/* Search */}
      <div className="relative mb-4">
        <span className="absolute inset-y-0 start-3 flex items-center text-gray-400">🔍</span>
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search suppliers..."
          className="w-full ps-9 pe-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers?.filter((s: any) => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return s.name?.toLowerCase().includes(q) || s.nameAr?.toLowerCase().includes(q) || s.contactName?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q);
          }).map((s: any) => (
            <div key={s.id} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{s.name}</h3>
                  {s.nameAr && <p className="text-sm text-gray-500">{s.nameAr}</p>}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openHistory(s)}
                    title={t('supplier.priceHistory')}
                    className="text-gray-400 hover:text-blue-600 p-1 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    📊
                  </button>
                  <button onClick={() => openEdit(s)} className="text-gray-400 hover:text-brand-600 p-1 rounded-lg hover:bg-gray-100">
                    ✏️
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-1">
                {s.contactName  && <p className="text-xs text-gray-500">👤 {s.contactName}</p>}
                {s.email        && <p className="text-xs text-gray-500">📧 {s.email}</p>}
                {s.phone        && <p className="text-xs text-gray-500">📞 {s.phone}</p>}
                {s.paymentTerms && <p className="text-xs text-gray-500">💳 {s.paymentTerms}</p>}
              </div>
            </div>
          ))}
          {!suppliers?.length && (
            <div className="col-span-full text-center py-12 text-gray-400">{t('common.noData')}</div>
          )}
        </div>
      )}

      {/* Edit / New Supplier Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Supplier' : 'New Supplier'} size="lg">
        <div className="grid grid-cols-2 gap-4">
          {[['name', 'Name (EN)'], ['nameAr', 'Name (AR)'], ['contactName', 'Contact'], ['email', 'Email'], ['phone', 'Phone'], ['paymentTerms', 'Payment Terms']].map(([key, label]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                value={(form as any)[key]}
                onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>
          ))}
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={() => setModal(false)} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium">{t('common.cancel')}</button>
          <button
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending || !form.name}
            className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white py-2.5 rounded-xl text-sm font-medium"
          >
            {saveMutation.isPending ? 'Saving...' : t('common.save')}
          </button>
        </div>
      </Modal>

      {/* Price History Modal */}
      <Modal
        open={historyModal}
        onClose={() => { setHistoryModal(false); setHistorySupplier(null); }}
        title={`📊 ${t('supplier.priceHistory')} — ${historySupplier?.name || ''}`}
        size="lg"
      >
        <div className="space-y-4">
          {/* Product filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('supplier.filterByProduct')}</label>
            <select
              value={historyProductFilter}
              onChange={e => setHistoryProductFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            >
              <option value="">{t('supplier.allProducts')}</option>
              {uniqueProducts.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
              ))}
            </select>
          </div>

          {/* History table */}
          {historyLoading ? <LoadingSpinner /> : (
            <div className="overflow-x-auto">
              {priceHistory && (priceHistory as SupplierPriceHistory[]).length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-start px-3 py-2 text-xs font-semibold text-gray-500">{t('common.date')}</th>
                      <th className="text-start px-3 py-2 text-xs font-semibold text-gray-500">{t('product.name')}</th>
                      <th className="text-start px-3 py-2 text-xs font-semibold text-gray-500">{t('product.sku')}</th>
                      <th className="text-end px-3 py-2 text-xs font-semibold text-gray-500">{t('supplier.oldPrice')}</th>
                      <th className="text-end px-3 py-2 text-xs font-semibold text-gray-500">{t('supplier.newPrice')}</th>
                      <th className="text-end px-3 py-2 text-xs font-semibold text-gray-500">{t('supplier.change')}</th>
                      <th className="text-start px-3 py-2 text-xs font-semibold text-gray-500">{t('supplier.source')}</th>
                      <th className="text-start px-3 py-2 text-xs font-semibold text-gray-500">{t('supplier.changedBy')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(priceHistory as SupplierPriceHistory[]).map((h) => {
                      const pctChange = h.oldPrice > 0
                        ? ((h.newPrice - h.oldPrice) / h.oldPrice * 100).toFixed(1)
                        : '—';
                      const isIncrease = h.newPrice > h.oldPrice;
                      const isDecrease = h.newPrice < h.oldPrice;
                      return (
                        <tr key={h.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                            {new Date(h.createdAt).toLocaleDateString()} {new Date(h.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-3 py-2 text-xs font-medium text-gray-900">{h.product.name}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{h.product.sku}</td>
                          <td className="px-3 py-2 text-xs text-gray-600 text-end">{cur} {h.oldPrice.toFixed(2)}</td>
                          <td className="px-3 py-2 text-xs font-medium text-end">
                            <span className={isIncrease ? 'text-red-600' : isDecrease ? 'text-green-600' : 'text-gray-600'}>
                              {cur} {h.newPrice.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs font-medium text-end">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs ${
                              isIncrease ? 'bg-red-50 text-red-700' : isDecrease ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'
                            }`}>
                              {isIncrease ? '▲' : isDecrease ? '▼' : '—'} {pctChange !== '—' ? `${pctChange}%` : pctChange}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              h.source === 'BULK_PRICING' ? 'bg-purple-50 text-purple-700'
                              : h.source === 'PURCHASE_ORDER' ? 'bg-blue-50 text-blue-700'
                              : 'bg-gray-100 text-gray-600'
                            }`}>
                              {h.source === 'BULK_PRICING' ? '📊 Bulk' : h.source === 'PURCHASE_ORDER' ? '📝 PO' : '✏️ Manual'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">
                            {h.changedBy ? `${h.changedBy.firstName} ${h.changedBy.lastName}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-3xl mb-2">📭</p>
                  <p className="text-sm">{t('supplier.noHistory')}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
