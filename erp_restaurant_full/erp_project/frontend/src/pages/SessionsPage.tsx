import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import StatusBadge from '../components/StatusBadge';
import { printSessionReport } from '../lib/thermalPrint';

export default function SessionsPage() {
  const { t } = useTranslation();
  const { activeBranch } = useAuth();
  const branchId = activeBranch?.id;
  const [openId, setOpenId] = useState<number | null>(null);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['pos-sessions-list', branchId ?? 'all'],
    queryFn: () => api.get('/pos-sessions', { params: branchId ? { branchId } : {} }).then((r) => r.data.data),
    refetchInterval: 30_000,
  });

  const { data: report } = useQuery({
    queryKey: ['pos-session-report', openId],
    queryFn: () => api.get(`/pos-sessions/${openId}/report`).then((r) => r.data.data),
    enabled: !!openId,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings-receipt'],
    queryFn: () => api.get('/settings').then((r) => r.data.data),
    staleTime: 300_000,
  });
  const businessInfo = useMemo(() => {
    const m: Record<string, string> = {};
    (settings || []).forEach((s: any) => { m[s.key] = s.value; });
    return { businessName: m.company_name || undefined, branchName: activeBranch?.name, logoUrl: m.company_logo ? `${window.location.origin}${m.company_logo}` : undefined };
  }, [settings, activeBranch]);

  return (
    <div>
      <PageHeader title={t('nav.sessions')} subtitle={activeBranch?.name} />
      {isLoading ? <LoadingSpinner /> : (
        <div className="space-y-2">
          {(sessions || []).map((s: any) => (
            <div key={s.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
              <button onClick={() => setOpenId(openId === s.id ? null : s.id)} className="w-full text-start p-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium text-sm">{s.sessionNo}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(s.openedAt).toLocaleString()}{s.closedAt ? ` → ${new Date(s.closedAt).toLocaleString()}` : ''} · {t('sessions.float')} {Number(s.openingFloat).toFixed(2)}
                  </div>
                </div>
                <StatusBadge status={s.status} size="sm" />
              </button>

              {openId === s.id && (
                <div className="border-t border-gray-100 dark:border-gray-800 p-3">
                  {!report ? <LoadingSpinner /> : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                        <Stat label={t('sessions.orders')} value={report.orderCount} />
                        <Stat label={t('sessions.sales')} value={Number(report.salesTotal).toFixed(2)} tone="text-emerald-600" />
                        <Stat label={t('sessions.cogs')} value={Number(report.foodCost).toFixed(2)} tone="text-rose-600" />
                        <Stat label={t('sessions.gp')} value={Number(report.grossProfit).toFixed(2)} tone="text-indigo-600" />
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                        <div className="font-semibold text-gray-500">{t('sessions.byMethod')}</div>
                        {Object.entries(report.paymentsByMethod || {}).map(([m, amt]: any) => (
                          <div key={m} className="flex justify-between"><span>{m.replace('_', ' ')}</span><span>{Number(amt).toFixed(2)}</span></div>
                        ))}
                        {!Object.keys(report.paymentsByMethod || {}).length && <div className="text-gray-400">—</div>}
                      </div>
                      <div className="text-xs mt-3 border-t border-gray-100 dark:border-gray-800 pt-2 space-y-1">
                        <div className="flex justify-between"><span>{t('sessions.expectedCash')}</span><span className="font-medium">{Number(report.expectedCash).toFixed(2)}</span></div>
                        {report.closingCounted != null && <div className="flex justify-between"><span>{t('sessions.countedCash')}</span><span className="font-medium">{Number(report.closingCounted).toFixed(2)}</span></div>}
                        {report.cashDifference != null && (
                          <div className="flex justify-between"><span>{t('sessions.difference')}</span>
                            <span className={`font-bold ${report.cashDifference < 0 ? 'text-red-600' : report.cashDifference > 0 ? 'text-emerald-600' : ''}`}>{Number(report.cashDifference).toFixed(2)}</span></div>
                        )}
                      </div>
                      <button onClick={() => printSessionReport(report, businessInfo)} className="mt-3 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-medium">
                        🖨 {report.session?.status === 'CLOSED' ? t('sessions.printZ') : t('sessions.printX')}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          {!sessions?.length && <p className="text-sm text-gray-400">{t('sessions.empty')}</p>}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: any; tone?: string }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 p-2 text-center">
      <div className="text-[10px] uppercase text-gray-400">{label}</div>
      <div className={`text-base font-bold ${tone ?? ''}`}>{value}</div>
    </div>
  );
}
