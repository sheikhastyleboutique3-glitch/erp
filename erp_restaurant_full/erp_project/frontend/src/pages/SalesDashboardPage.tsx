import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';

type Period = 'today' | 'week' | 'month';
const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899'];

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function SalesDashboardPage() {
  const { t } = useTranslation();
  const { activeBranch } = useAuth();
  const [period, setPeriod] = useState<Period>('today');
  const params = { period, ...(activeBranch?.id ? { branchId: activeBranch.id } : {}) };

  const { data: summary, isLoading } = useQuery({
    queryKey: ['sales-summary', period, activeBranch?.id ?? 'all'],
    queryFn: () => api.get('/analytics/sales-summary', { params }).then((r) => r.data.data),
    refetchInterval: 30_000,
  });
  const { data: bestSellers } = useQuery({
    queryKey: ['best-sellers', period, activeBranch?.id ?? 'all'],
    queryFn: () => api.get('/analytics/best-sellers', { params: { ...params, limit: 8 } }).then((r) => r.data.data),
  });
  const { data: topCustomers } = useQuery({
    queryKey: ['top-customers', period, activeBranch?.id ?? 'all'],
    queryFn: () => api.get('/analytics/top-customers', { params: { ...params, limit: 5 } }).then((r) => r.data.data),
  });

  const money = (n: number) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <div>
      <PageHeader title={t('nav.salesDashboard')} subtitle={activeBranch?.name} />
      <div className="flex gap-2 mb-4">
        {(['today', 'week', 'month'] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-lg text-sm capitalize ${period === p ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-800'}`}
          >
            {p}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <Stat label="Revenue" value={money(summary?.revenue)} />
            <Stat label="Orders" value={String(summary?.orders ?? 0)} />
            <Stat label="Gross Profit" value={money(summary?.grossProfit)} />
            <Stat label="Food Cost %" value={`${money(summary?.foodCostPct)}%`} />
            <Stat label="Avg Ticket" value={money(summary?.avgTicket)} />
            <Stat label="Discounts" value={money(summary?.discountTotal)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <h3 className="font-semibold text-sm mb-3">Best Sellers</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(bestSellers || []).map((b: any) => ({ name: b.product?.name ?? b.product?.id, qty: b.quantity }))}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="qty">
                      {(bestSellers || []).map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <h3 className="font-semibold text-sm mb-3">Payment Mix</h3>
              <div className="space-y-2">
                {(summary?.paymentMix || []).map((p: any) => (
                  <div key={p.method} className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-300">{p.method}</span>
                    <span className="font-medium">{money(p.amount)} ({p.count})</span>
                  </div>
                ))}
                {!summary?.paymentMix?.length && <p className="text-xs text-gray-400">No payments in this period.</p>}
              </div>

              <h3 className="font-semibold text-sm mt-5 mb-3">Top Customers</h3>
              <div className="space-y-2">
                {(topCustomers || []).map((c: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-300">{c.customer?.name ?? '—'}</span>
                    <span className="font-medium">{money(c.spend)} · {c.orders} orders</span>
                  </div>
                ))}
                {!topCustomers?.length && <p className="text-xs text-gray-400">No customer sales yet.</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
