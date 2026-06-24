import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import StatsCard from '../components/StatsCard';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import { format } from 'date-fns';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user, activeBranch } = useAuth();
  const navigate = useNavigate();

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const canSeeAnalytics = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'PROCUREMENT'].includes(user?.role || '');
  const canSeeInventory = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'PROCUREMENT', 'WAREHOUSE'].includes(user?.role || '');
  const canSeePO = ['SUPER_ADMIN', 'PROCUREMENT', 'WAREHOUSE'].includes(user?.role || '');

  /**
   * Branch scope comes from the global switcher (AuthContext):
   *   activeBranch = null  -> All Branches (no branchId param sent)
   *   activeBranch = {...}  -> a specific branch id
   */
  const effectiveBranchId: number | null = activeBranch?.id ?? null;

  const branchParam = effectiveBranchId ? `?branchId=${effectiveBranchId}` : '';
  const branchQs    = effectiveBranchId ? `branchId=${effectiveBranchId}` : '';

  const QUERY_OPTS = { staleTime: 0, refetchInterval: 30000, retry: 1 };

  const { data: stats } = useQuery({
    queryKey: ['req-stats', user?.role, effectiveBranchId],
    queryFn: () => api.get(`/requisitions/stats${branchParam}`).then(r => r.data.data),
    ...QUERY_OPTS,
  });

  const { data: recentReqs, isLoading: recentLoading } = useQuery({
    queryKey: ['recent-reqs', user?.role, effectiveBranchId],
    queryFn: () => api.get(`/requisitions${branchParam}`).then(r => r.data.data?.slice(0, 8)),
    ...QUERY_OPTS,
  });

  const { data: alerts } = useQuery({
    queryKey: ['alerts-dashboard', effectiveBranchId],
    queryFn: () => api.get('/alerts', { params: effectiveBranchId ? { branchId: effectiveBranchId } : {} }).then(r => r.data.data),
    ...QUERY_OPTS,
  });

  const { data: lowStock } = useQuery({
    queryKey: ['low-stock', effectiveBranchId],
    queryFn: () => api.get(`/inventory/low-stock${branchParam}`).then(r => r.data.data),
    enabled: canSeeInventory,
    ...QUERY_OPTS,
  });

  const { data: wastageData } = useQuery({
    queryKey: ['wastage-summary', effectiveBranchId],
    queryFn: () => api.get(`/reports/wastage-summary${branchParam}`).then(r => r.data.data),
    enabled: canSeeAnalytics,
    ...QUERY_OPTS,
  });

  const { data: highConsumption } = useQuery({
    queryKey: ['high-consumption', effectiveBranchId],
    queryFn: () => api.get(`/reports/high-consumption?limit=5${branchQs ? `&${branchQs}` : ''}`).then(r => r.data.data),
    enabled: canSeeAnalytics,
    ...QUERY_OPTS,
  });

  const { data: poStats } = useQuery({
    queryKey: ['po-stats-dashboard', user?.role, effectiveBranchId],
    queryFn: () => {
      const qs = effectiveBranchId ? `?branchId=${effectiveBranchId}` : '';
      return api.get(`/reports/purchase-order-stats${qs}`).then(r => r.data.data);
    },
    enabled: canSeePO,
    ...QUERY_OPTS,
  });

  // Requirement #2: per-location financials (stock value + cash float).
  const { data: financials } = useQuery({
    queryKey: ['financials', effectiveBranchId],
    queryFn: () => api.get(`/reports/financials${branchParam}`).then(r => r.data.data),
    enabled: canSeeInventory || canSeeAnalytics,
    ...QUERY_OPTS,
  });

  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 }).format(n || 0);

  const wastagePieData = wastageData?.byReason?.map((r: any) => ({ name: r.reason, value: r._sum?.quantity || 0 })) || [];
  const unreadAlerts   = alerts?.filter((a: any) => !a.isRead) || [];

  const s = {
    total:      stats?.total      ?? 0,
    submitted:  stats?.submitted  ?? 0,
    approved:   stats?.approved   ?? 0,
    inTransit:  stats?.inTransit  ?? 0,
    dispatched: stats?.dispatched ?? 0,
    confirmed:  stats?.confirmed  ?? 0,
    cancelled:  stats?.cancelled  ?? 0,
  };

  // Label for the current filter (driven by the global branch switcher)
  const filterLabel = activeBranch?.name || t('dashboard.allBranches');

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-brand-800 to-brand-600 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">👋 {t('auth.welcome')}, {user?.firstName}!</h2>
            <p className="text-brand-200 text-sm mt-1">
              {t(`roles.${user?.role}`)} • {filterLabel}
            </p>
          </div>

          {/* Branch scope is controlled by the global switcher in the top bar.
              The label above reflects the current selection (All or a branch). */}
        </div>
      </div>

      {/* Financial summary for the current location scope (Requirement #2) */}
      {(canSeeInventory || canSeeAnalytics) && financials && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatsCard
            title={`Current Stock Value — ${filterLabel}`}
            value={fmtCurrency(financials.stockValue)}
            icon="💰"
            color="green"
            subtitle={`${financials.lineItems ?? 0} stock lines · qty × latest unit cost`}
            onClick={() => navigate('/inventory')}
          />
          <StatsCard
            title={`Branch Cash Float — ${filterLabel}`}
            value={fmtCurrency(financials.cashFloat)}
            icon="🏦"
            color="indigo"
            subtitle="Petty cash for emergency local purchases"
          />
        </div>
      )}

      {/* Requisition Stats — ALL roles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title={t('dashboard.totalRequests')} value={s.total}      icon="📋" color="blue"   onClick={() => navigate('/requisitions')} />
        <StatsCard title={t('dashboard.pendingReview')} value={s.submitted}  icon="⏳"    color="yellow" onClick={() => navigate('/requisitions')} />
        <StatsCard title={t('dashboard.inTransit')}     value={s.dispatched} icon="🚚"    color="orange" onClick={() => navigate('/requisitions')} />
        <StatsCard title={t('dashboard.completed')}     value={s.confirmed}  icon="✅"    color="green"  onClick={() => navigate('/requisitions')} />
      </div>

      {/* Extended stats — management roles */}
      {canSeeAnalytics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard title={t('dashboard.approved')}    value={s.approved}  icon="👍" color="indigo" />
          <StatsCard title={t('dashboard.processing')}  value={s.inTransit} icon="📦" color="purple" />
          <StatsCard title={t('dashboard.cancelled')}   value={s.cancelled} icon="❌"  color="red"    />
          <StatsCard
            title={filterLabel}
            value={s.total}
            icon="🏢"
            color="blue"
            onClick={() => navigate('/requisitions')}
          />
        </div>
      )}

      {/* PO Stats */}
      {canSeePO && poStats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard title={t('dashboard.purchaseOrders')} value={poStats.total ?? 0} icon="📝" color="purple" onClick={() => navigate('/purchase-orders')} />
          <StatsCard title={t('dashboard.poDraft')}        value={poStats.draft ?? 0} icon="📄" color="gray" />
          <StatsCard title={t('dashboard.poPending')}      value={poStats.sent ?? poStats.pending ?? 0} icon="📦" color="blue" />
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-lg">💰</div>
              <div>
                <p className="text-xs text-gray-500">{t('dashboard.pendingValue')}</p>
                <p className="text-lg font-bold text-gray-900">QAR {(poStats.pendingValue ?? 0).toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent requisitions */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">📋 {t('dashboard.recentRequisitions')}</h3>
            <button onClick={() => navigate('/requisitions')} className="text-sm text-brand-600 font-medium">
              {t('dashboard.viewAll')} →
            </button>
          </div>
          {recentLoading ? <LoadingSpinner size="sm" /> : (
            <div className="divide-y divide-gray-50">
              {(!recentReqs || recentReqs.length === 0) && (
                <p className="text-center text-gray-400 text-sm py-8">{t('common.noData')}</p>
              )}
              {recentReqs?.map((req: any) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/requisitions/${req.id}`)}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{req.requisitionNo}</p>
                    <p className="text-xs text-gray-500">{req.department} • {req.branch?.name}</p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={req.status} size="sm" />
                    <p className="text-xs text-gray-400 mt-1">
                      {req.createdAt ? format(new Date(req.createdAt), 'MMM d, HH:mm') : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Alerts */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">
                🔔 {t('dashboard.alerts')}
                {unreadAlerts.length > 0 && (
                  <span className="ms-2 text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full">{unreadAlerts.length}</span>
                )}
              </h3>
              <button onClick={() => navigate('/alerts')} className="text-sm text-brand-600 font-medium">{t('dashboard.viewAll')}</button>
            </div>
            <div className="p-4 space-y-2">
              {!unreadAlerts.length && (
                <p className="text-xs text-gray-400 text-center py-2">✅ {t('dashboard.noAlerts')}</p>
              )}
              {unreadAlerts.slice(0, 4).map((a: any) => (
                <div key={a.id} className="flex items-start gap-2 p-2 bg-red-50 rounded-lg">
                  <span className="text-red-500 text-sm mt-0.5">⚠️</span>
                  <div>
                    <p className="text-xs font-medium text-red-800">{a.title}</p>
                    <p className="text-xs text-red-600 mt-0.5 line-clamp-1">{a.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Low stock */}
          {canSeeInventory && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">
                  📦 {t('dashboard.lowStock')}
                  {lowStock && lowStock.length > 0 && (
                    <span className="ms-2 text-xs bg-yellow-500 text-white px-1.5 py-0.5 rounded-full">{lowStock.length}</span>
                  )}
                </h3>
                <button onClick={() => navigate('/inventory')} className="text-sm text-brand-600 font-medium">{t('dashboard.viewAll')}</button>
              </div>
              <div className="p-4 space-y-2">
                {(!lowStock || !lowStock.length) && (
                  <p className="text-xs text-gray-400 text-center py-2">✅ {t('dashboard.allStockOk')}</p>
                )}
                {lowStock?.slice(0, 4).map((i: any) => (
                  <div key={i.id} className="flex items-center justify-between p-2 bg-yellow-50 rounded-lg">
                    <p className="text-xs font-medium text-yellow-800 truncate">{i.product?.name}</p>
                    <span className="text-xs text-yellow-600 font-bold ms-2 flex-shrink-0">
                      {i.quantity} / {i.product?.minStockLevel}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Analytics */}
      {canSeeAnalytics && wastagePieData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">🗑️ {t('dashboard.wastageByReason')}</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={wastagePieData} cx="50%" cy="50%" outerRadius={70} dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}>
                  {wastagePieData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {highConsumption && highConsumption.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">📈 {t('dashboard.topConsumed')}</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={highConsumption.map((h: any) => ({ name: h.product?.name?.substring(0, 12) || '', qty: h._sum?.quantity || 0 }))}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="qty" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
