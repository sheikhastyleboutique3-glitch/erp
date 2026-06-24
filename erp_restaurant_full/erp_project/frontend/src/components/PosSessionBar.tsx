import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { printSessionReport, BusinessInfo } from '../lib/thermalPrint';

/**
 * POS session / cash-control bar (Odoo POS parity). Opens a shift with a cash
 * float, records cash in/out, prints an X-report any time, and closes the shift
 * with a counted drawer (auto-prints the Z-report).
 */
export default function PosSessionBar({ branchId, businessInfo }: { branchId?: number; businessInfo: BusinessInfo }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [float, setFloat] = useState('');

  const key = ['pos-session-current', branchId];
  const { data: session } = useQuery({
    queryKey: key,
    queryFn: () => api.get('/pos-sessions/current', { params: { branchId } }).then((r) => r.data.data),
    enabled: !!branchId,
    refetchInterval: 30_000,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['pos-session-current'] });

  const openMut = useMutation({
    mutationFn: () => api.post('/pos-sessions/open', { branchId, openingFloat: parseFloat(float) || 0 }),
    onSuccess: () => { toast.success(t('pos.session.opened')); setFloat(''); invalidate(); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const cashMut = useMutation({
    mutationFn: (p: { type: 'CASH_IN' | 'CASH_OUT'; amount: number; reason?: string }) =>
      api.post(`/pos-sessions/${session.id}/cash`, p),
    onSuccess: () => { toast.success(t('pos.session.recorded')); invalidate(); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const closeMut = useMutation({
    mutationFn: (counted: number) => api.post(`/pos-sessions/${session.id}/close`, { closingCounted: counted }).then((r) => r.data.data),
    onSuccess: (rep) => { printSessionReport(rep, businessInfo); toast.success(t('pos.session.closed')); invalidate(); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const xreport = useMutation({
    mutationFn: () => api.get(`/pos-sessions/${session.id}/report`).then((r) => r.data.data),
    onSuccess: (rep) => printSessionReport(rep, businessInfo),
  });

  if (!branchId) return null;

  const promptCash = (type: 'CASH_IN' | 'CASH_OUT') => {
    const raw = window.prompt(t(type === 'CASH_IN' ? 'pos.session.cashInPrompt' : 'pos.session.cashOutPrompt'));
    if (!raw) return;
    const amount = parseFloat(raw);
    if (!(amount > 0)) return toast.error(t('pos.session.badAmount'));
    const reason = window.prompt(t('pos.session.reasonPrompt')) || undefined;
    cashMut.mutate({ type, amount, reason });
  };
  const promptClose = () => {
    const raw = window.prompt(t('pos.session.countPrompt'));
    if (raw == null) return;
    const counted = parseFloat(raw);
    if (!(counted >= 0)) return toast.error(t('pos.session.badAmount'));
    closeMut.mutate(counted);
  };

  if (!session) {
    return (
      <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-500/10 p-3 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-amber-700 dark:text-amber-300">{t('pos.session.closedNotice')}</span>
        <input
          type="number"
          value={float}
          onChange={(e) => setFloat(e.target.value)}
          placeholder={t('pos.session.openingFloat')}
          className="w-40 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
        />
        <button
          onClick={() => openMut.mutate()}
          disabled={openMut.isPending}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
        >
          {t('pos.session.open')}
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 p-3 flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
        ● {t('pos.session.openLabel')} · {session.sessionNo}
      </span>
      <span className="text-xs text-gray-500">{t('pos.session.float')}: {Number(session.openingFloat).toFixed(2)}</span>
      <div className="ms-auto flex flex-wrap gap-2">
        <button onClick={() => promptCash('CASH_IN')} className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs">＋ {t('pos.session.cashIn')}</button>
        <button onClick={() => promptCash('CASH_OUT')} className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs">－ {t('pos.session.cashOut')}</button>
        <button onClick={() => xreport.mutate()} className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs">🖨 {t('pos.session.xReport')}</button>
        <button onClick={promptClose} disabled={closeMut.isPending} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium disabled:opacity-50">{t('pos.session.close')}</button>
      </div>
    </div>
  );
}
