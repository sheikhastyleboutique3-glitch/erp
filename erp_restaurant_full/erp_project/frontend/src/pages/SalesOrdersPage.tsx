import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import StatusBadge from '../components/StatusBadge';

interface LineRow { productId: string; quantity: string; unitPrice: string }
const emptyLine = (): LineRow => ({ productId: '', quantity: '1', unitPrice: '0' });

export default function SalesOrdersPage() {
  const { t } = useTranslation();
  const { activeBranch } = useAuth();
  const qc = useQueryClient();
  const branchId = activeBranch?.id;

  const [customerId, setCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineRow[]>([emptyLine()]);

  const { data: quotes, isLoading } = useQuery({
    queryKey: ['sales-quotes', branchId ?? 'all'],
    queryFn: () => api.get('/sales-quotes', { params: branchId ? { branchId } : {} }).then((r) => r.data.data),
  });
  const { data: products } = useQuery({
    queryKey: ['products-for-quotes'],
    queryFn: () => api.get('/products', { params: { limit: 500 } }).then((r) => r.data.data),
    staleTime: 60_000,
  });
  const { data: customers } = useQuery({
    queryKey: ['customers-for-quotes'],
    queryFn: () => api.get('/customers').then((r) => r.data.data),
    staleTime: 60_000,
  });
  const productList: any[] = Array.isArray(products) ? products : products?.items ?? [];
  const productName = (id: number) => productList.find((p) => p.id === id)?.name ?? `#${id}`;

  const draftTotal = useMemo(
    () => lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0), 0),
    [lines],
  );

  const reset = () => { setCustomerId(''); setNotes(''); setLines([emptyLine()]); };

  const create = useMutation({
    mutationFn: () =>
      api.post('/sales-quotes', {
        branchId,
        customerId: customerId ? parseInt(customerId, 10) : undefined,
        notes: notes || undefined,
        items: lines
          .filter((l) => l.productId && parseFloat(l.quantity) > 0)
          .map((l) => ({ productId: parseInt(l.productId, 10), quantity: parseFloat(l.quantity), unitPrice: parseFloat(l.unitPrice) || 0 })),
      }),
    onSuccess: () => { toast.success(t('salesOrders.created')); reset(); qc.invalidateQueries({ queryKey: ['sales-quotes'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) => api.post(`/sales-quotes/${id}/${action}`, {}),
    onSuccess: (_d, v) => { toast.success(t(`salesOrders.${v.action}ed`)); qc.invalidateQueries({ queryKey: ['sales-quotes'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const updateLine = (i: number, patch: Partial<LineRow>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <div>
      <PageHeader title={t('nav.salesOrders')} subtitle={t('salesOrders.subtitle')} />
      {!branchId && <p className="text-xs text-amber-600 mb-3">{t('salesOrders.selectBranch')}</p>}

      {/* New quote */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 mb-5">
        <h3 className="text-sm font-semibold mb-3">{t('salesOrders.newQuote')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm">
            <option value="">{t('salesOrders.walkIn')}</option>
            {(customers || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('salesOrders.notes')} className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex flex-wrap gap-2 items-center">
              <select value={l.productId} onChange={(e) => { const p = productList.find((x) => x.id === parseInt(e.target.value, 10)); updateLine(i, { productId: e.target.value, unitPrice: l.unitPrice === '0' && p ? String(p.costPrice ?? 0) : l.unitPrice }); }} className="flex-1 min-w-[10rem] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm">
                <option value="">{t('salesOrders.product')}</option>
                {productList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} placeholder={t('salesOrders.qty')} className="w-20 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm" />
              <input type="number" value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: e.target.value })} placeholder={t('salesOrders.price')} className="w-24 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm" />
              <span className="w-20 text-end text-sm font-medium">{((parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0)).toFixed(2)}</span>
              <button onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))} disabled={lines.length === 1} className="text-red-600 text-sm px-1 disabled:opacity-30">✕</button>
            </div>
          ))}
        </div>
        <button onClick={() => setLines((prev) => [...prev, emptyLine()])} className="mt-2 text-xs text-primary hover:underline">+ {t('salesOrders.addLine')}</button>
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm font-bold">{t('salesOrders.total')}: {draftTotal.toFixed(2)}</span>
          <button disabled={!branchId || create.isPending || !lines.some((l) => l.productId)} onClick={() => create.mutate()} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50">
            {t('salesOrders.saveQuote')}
          </button>
        </div>
      </div>

      {/* Quote list */}
      {isLoading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {(quotes || []).map((q: any) => (
            <div key={q.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <div className="flex flex-wrap justify-between items-start gap-2">
                <div>
                  <div className="font-medium text-sm">{q.quoteNo} <span className="text-gray-400">· {Number(q.total).toFixed(2)}</span></div>
                  <div className="text-xs text-gray-500 mt-0.5">{q.items?.length ?? 0} {t('salesOrders.lines')}{q.orderId ? ` · ${t('salesOrders.order')} #${q.orderId}` : ''}</div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={q.status} size="sm" />
                  {q.status === 'DRAFT' && <button onClick={() => act.mutate({ id: q.id, action: 'confirm' })} className="text-xs px-2 py-1 rounded bg-sky-100 text-sky-700 dark:bg-sky-500/15">{t('salesOrders.confirm')}</button>}
                  {q.status === 'CONFIRMED' && <button onClick={() => act.mutate({ id: q.id, action: 'fulfill' })} className="text-xs px-2 py-1 rounded bg-emerald-600 text-white">{t('salesOrders.fulfill')}</button>}
                  {(q.status === 'DRAFT' || q.status === 'CONFIRMED') && <button onClick={() => act.mutate({ id: q.id, action: 'cancel' })} className="text-xs px-2 py-1 rounded text-red-600">{t('common.cancel')}</button>}
                </div>
              </div>
              {Array.isArray(q.items) && q.items.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {q.items.map((it: any) => (
                    <span key={it.id} className="text-xs bg-gray-50 dark:bg-gray-800/60 rounded px-2 py-0.5">{productName(it.productId)} ×{it.quantity}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {!quotes?.length && <p className="text-sm text-gray-400">{t('salesOrders.empty')}</p>}
        </div>
      )}
    </div>
  );
}
