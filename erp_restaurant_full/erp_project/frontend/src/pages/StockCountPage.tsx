import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';

export default function StockCountPage() {
  const { t } = useTranslation();
  const { activeBranch } = useAuth();
  const qc = useQueryClient();
  const branchId = activeBranch?.id;

  const [activeId, setActiveId] = useState<number | null>(null);
  const [counts, setCounts] = useState<Record<number, string>>({});

  const { data: list } = useQuery({
    queryKey: ['stock-counts', branchId ?? 'all'],
    queryFn: () => api.get('/stock-counts', { params: branchId ? { branchId } : {} }).then((r) => r.data.data),
  });
  const { data: active, isLoading } = useQuery({
    queryKey: ['stock-count', activeId],
    queryFn: () => api.get(`/stock-counts/${activeId}`).then((r) => r.data.data),
    enabled: !!activeId,
  });

  useEffect(() => {
    if (active?.items) {
      const m: Record<number, string> = {};
      active.items.forEach((it: any) => { m[it.id] = String(it.countedQty); });
      setCounts(m);
    }
  }, [active?.id]);

  const start = useMutation({
    mutationFn: () => api.post('/stock-counts', null, { params: { branchId } }).then((r) => r.data.data),
    onSuccess: (c) => { toast.success(t('stockCount.started')); setActiveId(c.id); qc.invalidateQueries({ queryKey: ['stock-counts'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const save = useMutation({
    mutationFn: () =>
      api.patch(`/stock-counts/${activeId}`, {
        items: (active?.items || []).map((it: any) => ({ id: it.id, countedQty: parseFloat(counts[it.id] ?? String(it.countedQty)) || 0 })),
      }),
    onSuccess: () => { toast.success(t('stockCount.saved')); qc.invalidateQueries({ queryKey: ['stock-count', activeId] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const finalize = useMutation({
    mutationFn: () => api.post(`/stock-counts/${activeId}/finalize`, {}),
    onSuccess: () => { toast.success(t('stockCount.finalized')); qc.invalidateQueries({ queryKey: ['stock-count', activeId] }); qc.invalidateQueries({ queryKey: ['stock-counts'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const isDraft = active?.status === 'DRAFT';

  return (
    <div>
      <PageHeader title={t('nav.stockCount')} subtitle={activeBranch?.name} />
      {!branchId && <p className="text-xs text-amber-600 mb-3">{t('stockCount.selectBranch')}</p>}

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => start.mutate()} disabled={!branchId || start.isPending} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50">
          + {t('stockCount.start')}
        </button>
        <select value={activeId ?? ''} onChange={(e) => setActiveId(e.target.value ? parseInt(e.target.value, 10) : null)} className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm">
          <option value="">{t('stockCount.openExisting')}</option>
          {(list || []).map((c: any) => <option key={c.id} value={c.id}>{c.countNo} · {c.status}</option>)}
        </select>
      </div>

      {activeId && (isLoading ? <LoadingSpinner /> : active && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
            <div className="font-semibold text-sm">{active.countNo} · {active.status}</div>
            <div className="text-sm">
              {t('stockCount.totalVariance')}:{' '}
              <span className={`font-bold ${active.totalVarianceValue < 0 ? 'text-red-600' : active.totalVarianceValue > 0 ? 'text-emerald-600' : ''}`}>
                {Number(active.totalVarianceValue).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-gray-400 text-start">
                  <th className="text-start py-1">{t('stockCount.product')}</th>
                  <th className="text-end py-1">{t('stockCount.system')}</th>
                  <th className="text-end py-1">{t('stockCount.counted')}</th>
                  <th className="text-end py-1">{t('stockCount.variance')}</th>
                  <th className="text-end py-1">{t('stockCount.value')}</th>
                </tr>
              </thead>
              <tbody>
                {(active.items || []).map((it: any) => {
                  const counted = parseFloat(counts[it.id] ?? String(it.countedQty)) || 0;
                  const variance = +(counted - it.systemQty).toFixed(3);
                  return (
                    <tr key={it.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="py-1.5">{it.product?.name ?? `#${it.productId}`}</td>
                      <td className="text-end">{it.systemQty}{it.product?.unit?.abbreviation ? ` ${it.product.unit.abbreviation}` : ''}</td>
                      <td className="text-end">
                        {isDraft ? (
                          <input type="number" value={counts[it.id] ?? ''} onChange={(e) => setCounts((p) => ({ ...p, [it.id]: e.target.value }))} className="w-20 text-end rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs" />
                        ) : it.countedQty}
                      </td>
                      <td className={`text-end ${variance < 0 ? 'text-red-600' : variance > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>{variance > 0 ? '+' : ''}{variance}</td>
                      <td className="text-end text-gray-500">{(variance * it.unitCost).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {isDraft && (
            <div className="flex gap-2 mt-4">
              <button onClick={() => save.mutate()} disabled={save.isPending} className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm font-medium disabled:opacity-50">{t('stockCount.save')}</button>
              <button onClick={() => { if (window.confirm(t('stockCount.finalizeConfirm'))) finalize.mutate(); }} disabled={finalize.isPending} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50">{t('stockCount.finalize')}</button>
            </div>
          )}
          <p className="text-[11px] text-gray-400 mt-3">{t('stockCount.note')}</p>
        </div>
      ))}
    </div>
  );
}
