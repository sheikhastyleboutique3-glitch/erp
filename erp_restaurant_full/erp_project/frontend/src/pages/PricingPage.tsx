import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

/**
 * Phase 4: Bulk Pricing Engine
 * Adjust prices by % or fixed amount, scoped to category / supplier / specific products.
 * Shows a live preview table before committing. Full cascade to open requisitions + POs.
 */
export default function PricingPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [adjustType, setAdjustType] = useState<'percentage' | 'fixed'>('percentage');
  const [value, setValue] = useState('');
  const [scopeType, setScopeType] = useState<'all' | 'category' | 'supplier'>('all');
  const [categoryId, setCategoryId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [preview, setPreview] = useState<any[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [result, setResult] = useState<any>(null);

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/categories').then(r => r.data.data) });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: () => api.get('/suppliers').then(r => r.data.data) });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings').then(r => r.data.data) });
  const cur = (settings?.find((s: any) => s.key === 'default_currency')?.value) || 'QAR';
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => api.get('/products').then(r => r.data.data) });

  const buildScope = () => ({
    ...(scopeType === 'category' && categoryId ? { categoryId: +categoryId } : {}),
    ...(scopeType === 'supplier' && supplierId ? { supplierId: +supplierId } : {}),
  });

  const handlePreview = () => {
    if (!value || isNaN(+value)) { toast.error('Enter a valid value'); return; }
    setPreviewing(true);
    const numVal = +value;
    const filtered = (products || []).filter((p: any) => {
      if (scopeType === 'category' && categoryId) return p.categoryId === +categoryId;
      if (scopeType === 'supplier' && supplierId) return p.supplierId === +supplierId;
      return true;
    });
    const rows = filtered.map((p: any) => {
      const newPrice = adjustType === 'percentage'
        ? Math.max(0, Math.round(p.costPrice * (1 + numVal / 100) * 100) / 100)
        : Math.max(0, Math.round((p.costPrice + numVal) * 100) / 100);
      return { id: p.id, sku: p.sku, name: p.name, oldPrice: p.costPrice, newPrice, delta: Math.round((newPrice - p.costPrice) * 100) / 100 };
    });
    setPreview(rows);
    setPreviewing(false);
  };

  const applyMutation = useMutation({
    mutationFn: () => api.post('/pricing/bulk-update', {
      type: adjustType,
      value: +value,
      scope: buildScope(),
    }),
    onSuccess: (res) => {
      const d = res.data.data;
      setResult(d);
      toast.success(`Updated ${d.updated} products`);
      setPreview([]);
      setValue('');
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="💰 Bulk Pricing"
        subtitle="Adjust prices across categories or suppliers with cascade to open orders"
      />

      {/* Controls */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Adjustment type */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Adjustment Type</label>
            <div className="flex rounded-xl border border-gray-200 overflow-hidden">
              {(['percentage', 'fixed'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setAdjustType(type)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    adjustType === type ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {type === 'percentage' ? '% Percent' : '# Fixed'}
                </button>
              ))}
            </div>
          </div>

          {/* Value */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {adjustType === 'percentage' ? 'Percentage (e.g. 10 = +10%, -5 = -5%)' : `Fixed Amount (${cur})`}
            </label>
            <input
              type="number"
              value={value}
              onChange={e => { setValue(e.target.value); setPreview([]); setResult(null); }}
              placeholder={adjustType === 'percentage' ? '10' : '2.50'}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Scope */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Scope</label>
            <select
              value={scopeType}
              onChange={e => { setScopeType(e.target.value as any); setCategoryId(''); setSupplierId(''); setPreview([]); }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
            >
              <option value="all">All Products</option>
              <option value="category">By Category</option>
              <option value="supplier">By Supplier</option>
            </select>
          </div>
        </div>

        {/* Scope sub-filter */}
        {scopeType === 'category' && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Category</label>
            <select value={categoryId} onChange={e => { setCategoryId(e.target.value); setPreview([]); }} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
              <option value="">Select category</option>
              {categories?.map((c: any) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
        )}
        {scopeType === 'supplier' && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Supplier</label>
            <select value={supplierId} onChange={e => { setSupplierId(e.target.value); setPreview([]); }} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
              <option value="">Select supplier</option>
              {suppliers?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handlePreview}
            disabled={!value || previewing}
            className="flex-1 border border-brand-600 text-brand-600 hover:bg-brand-50 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {previewing ? 'Calculating...' : '👁 Preview Changes'}
          </button>
          <button
            onClick={() => applyMutation.mutate()}
            disabled={applyMutation.isPending || !preview.length}
            className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white py-2.5 rounded-xl text-sm font-semibold"
          >
            {applyMutation.isPending ? 'Applying...' : `✅ Apply to ${preview.length} Products`}
          </button>
        </div>
      </div>

      {/* Result banner */}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
          <p className="font-semibold text-green-800">✅ Bulk update complete</p>
          <div className="grid grid-cols-3 gap-4 mt-3">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-700">{result.updated}</p>
              <p className="text-xs text-green-600">Products updated</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-700">{result.cascaded?.requisitionItems || 0}</p>
              <p className="text-xs text-blue-600">Requisition items cascaded</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-700">{result.cascaded?.purchaseOrderItems || 0}</p>
              <p className="text-xs text-purple-600">PO items recalculated</p>
            </div>
          </div>
        </div>
      )}

      {/* Preview table */}
      {preview.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Preview — {preview.length} products affected</h3>
            <span className="text-xs text-gray-400">
              {adjustType === 'percentage' ? `${+value > 0 ? '+' : ''}${value}%` : `${+value > 0 ? '+' : ''}${cur} ${value}`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">SKU</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Product</th>
                  <th className="text-end px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Current Price</th>
                  <th className="text-end px-4 py-3 text-xs font-semibold text-gray-500 uppercase">New Price</th>
                  <th className="text-end px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {preview.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{row.sku}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-900">{row.name}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600 text-end">{cur} {row.oldPrice.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-sm font-semibold text-gray-900 text-end">{cur} {row.newPrice.toFixed(2)}</td>
                    <td className={`px-4 py-2.5 text-sm font-semibold text-end ${
                      row.delta > 0 ? 'text-green-600' : row.delta < 0 ? 'text-red-600' : 'text-gray-400'
                    }`}>
                      {row.delta > 0 ? '+' : ''}{row.delta.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
