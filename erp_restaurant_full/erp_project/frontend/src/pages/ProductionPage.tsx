import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import StatusBadge from '../components/StatusBadge';

export default function ProductionPage() {
  const { t } = useTranslation();
  const { activeBranch } = useAuth();
  const qc = useQueryClient();
  const [productId, setProductId] = useState<string>('');
  const [plannedQty, setPlannedQty] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState<string>('');

  const branchId = activeBranch?.id;

  const { data: orders, isLoading } = useQuery({
    queryKey: ['production', branchId ?? 'all'],
    queryFn: () =>
      api.get('/production', { params: branchId ? { branchId } : {} }).then((r) => r.data.data),
    refetchInterval: 20_000,
  });
  const { data: products } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => api.get('/products').then((r) => r.data.data),
    staleTime: 300_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['production'] });

  const create = useMutation({
    mutationFn: () =>
      api.post('/production', {
        branchId,
        productId: parseInt(productId, 10),
        plannedQty: parseFloat(plannedQty),
        expiryDate: expiryDate || undefined,
      }),
    onSuccess: () => {
      toast.success('Production order created');
      setProductId('');
      setPlannedQty('');
      setExpiryDate('');
      invalidate();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const action = useMutation({
    mutationFn: ({ id, verb }: { id: number; verb: 'start' | 'cancel' | 'complete' }) =>
      verb === 'complete'
        ? api.post(`/production/${id}/complete`, {})
        : api.patch(`/production/${id}/${verb}`),
    onSuccess: () => {
      toast.success('Updated');
      invalidate();
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  return (
    <div>
      <PageHeader title={t('nav.production')} subtitle={activeBranch?.name} />

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 mb-5">
        <h3 className="font-semibold text-sm mb-3">New production run</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          >
            <option value="">Select product…</option>
            {(products || []).map((p: any) => (
              <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
            ))}
          </select>
          <input
            type="number" value={plannedQty} onChange={(e) => setPlannedQty(e.target.value)}
            placeholder="Planned qty"
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          />
          <input
            type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          />
          <button
            disabled={!branchId || !productId || !plannedQty || create.isPending}
            onClick={() => create.mutate()}
            className="py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50"
          >
            Create
          </button>
        </div>
        {!branchId && <p className="text-xs text-amber-600 mt-2">Select a branch in the top bar first.</p>}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2">No.</th>
                  <th className="text-left px-3 py-2">Product</th>
                  <th className="text-right px-3 py-2">Planned</th>
                  <th className="text-right px-3 py-2">Produced</th>
                  <th className="text-right px-3 py-2">Cost</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {(orders || []).map((o: any) => (
                  <tr key={o.id}>
                    <td className="px-3 py-2 font-mono text-xs">{o.productionNo}</td>
                    <td className="px-3 py-2">#{o.productId}</td>
                    <td className="px-3 py-2 text-right">{o.plannedQty}</td>
                    <td className="px-3 py-2 text-right">{o.producedQty}</td>
                    <td className="px-3 py-2 text-right">{Number(o.totalCost).toFixed(2)}</td>
                    <td className="px-3 py-2"><StatusBadge status={o.status} /></td>
                    <td className="px-3 py-2 text-right space-x-1">
                      {o.status === 'PLANNED' && (
                        <button onClick={() => action.mutate({ id: o.id, verb: 'start' })} className="px-2 py-1 rounded bg-amber-100 text-amber-800 text-xs">Start</button>
                      )}
                      {(o.status === 'PLANNED' || o.status === 'IN_PROGRESS') && (
                        <>
                          <button onClick={() => action.mutate({ id: o.id, verb: 'complete' })} className="px-2 py-1 rounded bg-green-100 text-green-800 text-xs">Complete</button>
                          <button onClick={() => action.mutate({ id: o.id, verb: 'cancel' })} className="px-2 py-1 rounded bg-red-100 text-red-700 text-xs">Cancel</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {!orders?.length && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">No production orders.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
