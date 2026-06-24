import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';

const bucketTone: Record<string, string> = {
  '0-30': 'text-emerald-600',
  '31-60': 'text-amber-600',
  '61-90': 'text-orange-600',
  '90+': 'text-red-600',
};

export default function ReceivablesPage() {
  const { t } = useTranslation();
  const { activeBranch } = useAuth();
  const qc = useQueryClient();
  const branchId = activeBranch?.id;
  const params = branchId ? { branchId } : {};

  const { data: rows, isLoading } = useQuery({
    queryKey: ['receivables', branchId ?? 'all'],
    queryFn: () => api.get('/receivables', { params }).then((r) => r.data.data),
    refetchInterval: 60_000,
  });
  const { data: aging } = useQuery({
    queryKey: ['receivables-aging', branchId ?? 'all'],
    queryFn: () => api.get('/receivables/aging', { params }).then((r) => r.data.data),
    refetchInterval: 60_000,
  });

  const pay = useMutation({
    mutationFn: ({ orderId, amount, method }: { orderId: number; amount: number; method: string }) =>
      api.post(`/sales/orders/${orderId}/payments`, { method, amount }),
    onSuccess: () => {
      toast.success(t('receivables.paymentRecorded'));
      qc.invalidateQueries({ queryKey: ['receivables'] });
      qc.invalidateQueries({ queryKey: ['receivables-aging'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const recordPayment = (r: any) => {
    const raw = window.prompt(t('receivables.amountPrompt', { max: r.outstanding.toFixed(2) }), r.outstanding.toFixed(2));
    if (raw == null) return;
    const amount = parseFloat(raw);
    if (!(amount > 0)) return toast.error(t('receivables.badAmount'));
    const method = (window.prompt(t('receivables.methodPrompt'), 'CASH') || 'CASH').toUpperCase().replace(/\s+/g, '_');
    pay.mutate({ orderId: r.orderId, amount, method });
  };

  return (
    <div>
      <PageHeader title={t('nav.receivables')} subtitle={activeBranch?.name} />

      {/* Aging summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {(['0-30', '31-60', '61-90', '90+'] as const).map((b) => (
          <div key={b} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 text-center">
            <div className="text-[10px] uppercase text-gray-400">{b} {t('receivables.days')}</div>
            <div className={`text-lg font-bold ${bucketTone[b]}`}>{Number(aging?.buckets?.[b] ?? 0).toFixed(2)}</div>
          </div>
        ))}
        <div className="rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-3 text-center">
          <div className="text-[10px] uppercase text-gray-400">{t('receivables.totalOutstanding')}</div>
          <div className="text-lg font-extrabold">{Number(aging?.total ?? 0).toFixed(2)}</div>
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm bg-white dark:bg-gray-900">
            <thead>
              <tr className="text-[10px] uppercase text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="text-start p-3">{t('receivables.invoice')}</th>
                <th className="text-start p-3">{t('receivables.customer')}</th>
                <th className="text-end p-3">{t('receivables.total')}</th>
                <th className="text-end p-3">{t('receivables.paid')}</th>
                <th className="text-end p-3">{t('receivables.outstanding')}</th>
                <th className="text-end p-3">{t('receivables.age')}</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {(rows || []).map((r: any) => (
                <tr key={r.orderId} className="border-b border-gray-50 dark:border-gray-800/50">
                  <td className="p-3 font-medium">{r.orderNo}</td>
                  <td className="p-3">{r.customer?.name ?? '—'}<div className="text-xs text-gray-400">{r.customer?.phone || ''}</div></td>
                  <td className="p-3 text-end">{r.total.toFixed(2)}</td>
                  <td className="p-3 text-end text-gray-500">{r.paid.toFixed(2)}</td>
                  <td className="p-3 text-end font-semibold">{r.outstanding.toFixed(2)}</td>
                  <td className={`p-3 text-end ${bucketTone[r.bucket]}`}>{r.ageDays} {t('receivables.d')}</td>
                  <td className="p-3 text-end">
                    <button onClick={() => recordPayment(r)} className="text-xs px-2 py-1 rounded bg-primary text-white font-medium">{t('receivables.recordPayment')}</button>
                  </td>
                </tr>
              ))}
              {!rows?.length && (
                <tr><td colSpan={7} className="p-6 text-center text-sm text-gray-400">{t('receivables.empty')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
