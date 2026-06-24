import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import StatusBadge from '../components/StatusBadge';
import { printReceipt } from '../lib/thermalPrint';

const STATUSES = ['', 'OPEN', 'HELD', 'COMPLETED', 'VOIDED', 'REFUNDED'];

export default function SalesHistoryPage() {
  const { t } = useTranslation();
  const { activeBranch, user } = useAuth();
  const qc = useQueryClient();
  const branchId = activeBranch?.id;
  const canRefund = user?.role === 'SUPER_ADMIN' || user?.role === 'BRANCH_MANAGER';

  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ['sales-history', branchId ?? 'all', status],
    queryFn: () =>
      api
        .get('/sales/orders', { params: { ...(branchId ? { branchId } : {}), ...(status ? { status } : {}) } })
        .then((r) => r.data.data),
    refetchInterval: 30_000,
  });

  // Branding for receipt reprints.
  const { data: settings } = useQuery({
    queryKey: ['settings-receipt'],
    queryFn: () => api.get('/settings').then((r) => r.data.data),
    staleTime: 300_000,
  });
  const businessInfo = useMemo(() => {
    const m: Record<string, string> = {};
    (settings || []).forEach((s: any) => { m[s.key] = s.value; });
    return {
      businessName: m.company_name || undefined,
      branchName: activeBranch?.name,
      logoUrl: m.company_logo ? `${window.location.origin}${m.company_logo}` : undefined,
      address: m.company_address || undefined,
      phone: m.company_phone || undefined,
      taxId: m.company_tax_id || undefined,
    };
  }, [settings, activeBranch]);

  const refund = useMutation({
    mutationFn: (id: number) => api.post(`/sales/orders/${id}/refund`, {}).then((r) => r.data.data),
    onSuccess: (o) => { toast.success(`Order ${o.orderNo} refunded`); qc.invalidateQueries({ queryKey: ['sales-history'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Refund failed'),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (orders || []).filter((o: any) =>
      !q || o.orderNo?.toLowerCase().includes(q) || (o.tableName || '').toLowerCase().includes(q) || (o.customer?.name || '').toLowerCase().includes(q),
    );
  }, [orders, search]);

  const totals = useMemo(() => {
    const completed = (filtered || []).filter((o: any) => o.status === 'COMPLETED');
    return {
      count: completed.length,
      sales: completed.reduce((s: number, o: any) => s + o.total, 0),
      gp: completed.reduce((s: number, o: any) => s + (o.grossProfit ?? 0), 0),
    };
  }, [filtered]);

  return (
    <div>
      <PageHeader title={t('nav.salesHistory')} subtitle={activeBranch?.name} />

      <div className="flex flex-wrap gap-2 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('salesHistory.search')} className="flex-1 min-w-[200px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm">
          {STATUSES.map((s) => <option key={s} value={s}>{s ? s.replace('_', ' ') : t('salesHistory.allStatuses')}</option>)}
        </select>
      </div>

      {/* Summary of the filtered completed orders */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 text-center">
          <div className="text-[10px] uppercase text-gray-400">{t('salesHistory.completed')}</div>
          <div className="text-lg font-bold">{totals.count}</div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 text-center">
          <div className="text-[10px] uppercase text-gray-400">{t('salesHistory.sales')}</div>
          <div className="text-lg font-bold text-emerald-600">{totals.sales.toFixed(2)}</div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 text-center">
          <div className="text-[10px] uppercase text-gray-400">{t('salesHistory.grossProfit')}</div>
          <div className="text-lg font-bold text-indigo-600">{totals.gp.toFixed(2)}</div>
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="space-y-2">
          {filtered.map((o: any) => (
            <div key={o.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
              <button onClick={() => setOpenId(openId === o.id ? null : o.id)} className="w-full text-start p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{o.orderNo}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(o.createdAt).toLocaleString()} · {o.channel}{o.tableName ? ` · ${o.tableName}` : ''}{o.customer?.name ? ` · ${o.customer.name}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{Number(o.total).toFixed(2)}</span>
                  <StatusBadge status={o.status} size="sm" />
                </div>
              </button>

              {openId === o.id && (
                <div className="border-t border-gray-100 dark:border-gray-800 p-3">
                  <div className="space-y-1 mb-2">
                    {(o.items || []).map((it: any) => (
                      <div key={it.id} className="flex justify-between text-xs">
                        <span>{it.quantity} × {it.product?.name ?? `#${it.productId}`}{Array.isArray(it.modifiers) && it.modifiers.length ? ` (${it.modifiers.map((m: any) => m.name).join(', ')})` : ''}</span>
                        <span>{(it.unitPrice * it.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-gray-500 border-t border-gray-100 dark:border-gray-800 pt-2">
                    <span>
                      {(o.payments || []).map((p: any) => `${p.method.replace('_', ' ')} ${Number(p.amount).toFixed(2)}`).join(' · ') || t('salesHistory.unpaid')}
                    </span>
                    <span>{t('salesHistory.cost')}: {Number(o.foodCost ?? 0).toFixed(2)} · {t('salesHistory.gp')}: {Number(o.grossProfit ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => printReceipt(o, businessInfo)} className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-medium">🖨 {t('salesHistory.reprint')}</button>
                    {canRefund && o.status === 'COMPLETED' && (
                      <button onClick={() => { if (window.confirm(t('pos.refundConfirm'))) refund.mutate(o.id); }} disabled={refund.isPending} className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 text-xs font-medium disabled:opacity-50">{t('salesHistory.refund')}</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {!filtered.length && <p className="text-sm text-gray-400">{t('salesHistory.empty')}</p>}
        </div>
      )}
    </div>
  );
}
