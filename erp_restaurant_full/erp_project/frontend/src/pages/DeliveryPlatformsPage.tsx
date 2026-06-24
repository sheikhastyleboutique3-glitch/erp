import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';

interface PlatformForm {
  name: string;
  channel: string;
  commissionPct: number;
  payoutTermDays: number;
  notes?: string;
}

const EMPTY: PlatformForm = { name: '', channel: 'AGGREGATOR', commissionPct: 0, payoutTermDays: 7, notes: '' };

export default function DeliveryPlatformsPage() {
  const { t } = useTranslation();
  const { activeBranch } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<PlatformForm>(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);

  const { data: platforms, isLoading } = useQuery({
    queryKey: ['delivery-platforms'],
    queryFn: () => api.get('/delivery-platforms').then((r) => r.data.data),
  });
  const { data: recon } = useQuery({
    queryKey: ['delivery-recon', activeBranch?.id ?? 'all'],
    queryFn: () =>
      api
        .get('/delivery-platforms/reconciliation', { params: activeBranch?.id ? { branchId: activeBranch.id } : {} })
        .then((r) => r.data.data),
    refetchInterval: 60_000,
  });

  const save = useMutation({
    mutationFn: () =>
      editId
        ? api.patch(`/delivery-platforms/${editId}`, form)
        : api.post('/delivery-platforms', form),
    onSuccess: () => {
      toast.success(t('common.saved'));
      qc.invalidateQueries({ queryKey: ['delivery-platforms'] });
      setForm(EMPTY);
      setEditId(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/delivery-platforms/${id}`),
    onSuccess: () => {
      toast.success(t('common.deleted'));
      qc.invalidateQueries({ queryKey: ['delivery-platforms'] });
    },
  });

  const startEdit = (p: any) => {
    setEditId(p.id);
    setForm({ name: p.name, channel: p.channel, commissionPct: p.commissionPct, payoutTermDays: p.payoutTermDays, notes: p.notes ?? '' });
  };

  return (
    <div>
      <PageHeader title={t('nav.deliveryPlatforms')} subtitle={t('deliveryPlatforms.subtitle')} />

      {/* Reconciliation summary — money held by aggregators, owed to us */}
      <div className="mb-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="text-xs uppercase text-gray-400 mb-3">{t('deliveryPlatforms.reconciliation')}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="text-start p-2">{t('deliveryPlatforms.platform')}</th>
                <th className="text-end p-2">{t('deliveryPlatforms.orders')}</th>
                <th className="text-end p-2">{t('deliveryPlatforms.gross')}</th>
                <th className="text-end p-2">{t('deliveryPlatforms.commission')}</th>
                <th className="text-end p-2">{t('deliveryPlatforms.netPayout')}</th>
              </tr>
            </thead>
            <tbody>
              {(recon?.rows || []).map((r: any) => (
                <tr key={r.key} className="border-b border-gray-50 dark:border-gray-800/50">
                  <td className="p-2 font-medium">{r.key}</td>
                  <td className="p-2 text-end">{r.orders}</td>
                  <td className="p-2 text-end">{r.gross.toFixed(2)}</td>
                  <td className="p-2 text-end text-red-600">-{r.commission.toFixed(2)}</td>
                  <td className="p-2 text-end font-semibold text-emerald-600">{r.netPayout.toFixed(2)}</td>
                </tr>
              ))}
              {!recon?.rows?.length && (
                <tr><td colSpan={5} className="p-4 text-center text-gray-400">{t('deliveryPlatforms.noRecon')}</td></tr>
              )}
            </tbody>
            {recon?.rows?.length ? (
              <tfoot>
                <tr className="font-bold border-t border-gray-200 dark:border-gray-700">
                  <td className="p-2">{t('common.total')}</td>
                  <td className="p-2 text-end">{recon.totals.orders}</td>
                  <td className="p-2 text-end">{recon.totals.gross.toFixed(2)}</td>
                  <td className="p-2 text-end text-red-600">-{recon.totals.commission.toFixed(2)}</td>
                  <td className="p-2 text-end text-emerald-600">{recon.totals.netPayout.toFixed(2)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {/* Platform list */}
        <div className="md:col-span-2">
          {isLoading ? <LoadingSpinner /> : (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase text-gray-400 border-b border-gray-100 dark:border-gray-800">
                    <th className="text-start p-3">{t('deliveryPlatforms.platform')}</th>
                    <th className="text-start p-3">{t('deliveryPlatforms.channel')}</th>
                    <th className="text-end p-3">{t('deliveryPlatforms.commissionPct')}</th>
                    <th className="text-end p-3">{t('deliveryPlatforms.payoutDays')}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {(platforms || []).map((p: any) => (
                    <tr key={p.id} className={`border-b border-gray-50 dark:border-gray-800/50 ${!p.isActive ? 'opacity-40' : ''}`}>
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3 text-gray-500">{p.channel}</td>
                      <td className="p-3 text-end">{p.commissionPct}%</td>
                      <td className="p-3 text-end">{p.payoutTermDays}</td>
                      <td className="p-3 text-end whitespace-nowrap">
                        <button onClick={() => startEdit(p)} className="text-xs text-primary mr-3">{t('common.edit')}</button>
                        <button onClick={() => remove.mutate(p.id)} className="text-xs text-red-600">{t('common.delete')}</button>
                      </td>
                    </tr>
                  ))}
                  {!platforms?.length && (
                    <tr><td colSpan={5} className="p-6 text-center text-gray-400">{t('deliveryPlatforms.empty')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create / edit form */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3 h-fit">
          <div className="text-sm font-semibold">{editId ? t('common.edit') : t('deliveryPlatforms.add')}</div>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t('deliveryPlatforms.platform')}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          />
          <select
            value={form.channel}
            onChange={(e) => setForm({ ...form, channel: e.target.value })}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          >
            <option value="TALABAT">TALABAT</option>
            <option value="SNOONU">SNOONU</option>
            <option value="AGGREGATOR">AGGREGATOR (other)</option>
          </select>
          <label className="block text-xs text-gray-500">{t('deliveryPlatforms.commissionPct')}
            <input
              type="number" min={0} step="0.5"
              value={form.commissionPct}
              onChange={(e) => setForm({ ...form, commissionPct: parseFloat(e.target.value) || 0 })}
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs text-gray-500">{t('deliveryPlatforms.payoutDays')}
            <input
              type="number" min={0}
              value={form.payoutTermDays}
              onChange={(e) => setForm({ ...form, payoutTermDays: parseInt(e.target.value, 10) || 0 })}
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <button
              disabled={!form.name || save.isPending}
              onClick={() => save.mutate()}
              className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50"
            >
              {editId ? t('common.save') : t('common.add')}
            </button>
            {editId && (
              <button onClick={() => { setEditId(null); setForm(EMPTY); }} className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm">
                {t('common.cancel')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
