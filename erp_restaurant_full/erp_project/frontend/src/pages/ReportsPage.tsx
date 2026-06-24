import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import api, { downloadCsv } from '../lib/api';
import toast from 'react-hot-toast';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import {
  PieChart, Pie, Cell,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#8b5cf6', '#ec4899'];
const AXIS = '#94a3b8';
const GRID = 'rgba(148,163,184,0.18)';
type Tab = 'wastage' | 'cost' | 'consumption' | 'inventory-value' | 'price-history';

/** Modern surface card used across the analytics tabs. */
function Card({ title, subtitle, icon, onPrint, children }: { title: string; subtitle?: string; icon?: string; onPrint?: () => void; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-elev-sm p-5 sm:p-6">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {icon && <span className="flex-shrink-0 w-9 h-9 rounded-xl bg-accent-subtle text-accent-subtle-fg flex items-center justify-center text-lg">{icon}</span>}
          <div className="min-w-0">
            <h3 className="font-semibold text-fg truncate">{title}</h3>
            {subtitle && <p className="text-xs text-fg-muted mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {onPrint && <button onClick={onPrint} className="no-print text-xs text-fg-subtle hover:text-fg flex-shrink-0">🖨️ Print</button>}
      </div>
      {children}
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-elev-sm ${accent ? 'bg-accent-subtle border-transparent' : 'bg-surface border-border'}`}>
      <p className={`text-xs ${accent ? 'text-accent-subtle-fg' : 'text-fg-muted'}`}>{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent ? 'text-accent-subtle-fg' : 'text-fg'}`}>{value}</p>
    </div>
  );
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const { activeBranch } = useAuth();
  const [tab, setTab] = useState<Tab>('wastage');

  // Date range filter for exports and analytics
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const bp = activeBranch?.id ? `?branchId=${activeBranch.id}` : '';

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings').then(r => r.data.data) });
  const cur = (settings?.find((s: any) => s.key === 'default_currency')?.value) || 'QAR';

  const { data: wastageData,     isLoading: wL } = useQuery({ queryKey: ['report-wastage',     activeBranch?.id, fromDate, toDate], queryFn: () => api.get(`/reports/wastage-summary${bp}${bp ? '&' : '?'}from=${fromDate}&to=${toDate}`).then(r => r.data.data), enabled: tab === 'wastage' });
  const { data: costData,        isLoading: cL } = useQuery({ queryKey: ['report-cost',         activeBranch?.id], queryFn: () => api.get(`/reports/cost-variance${bp}`).then(r => r.data.data),       enabled: tab === 'cost' });
  const { data: consumptionData, isLoading: hL } = useQuery({ queryKey: ['report-consumption',  activeBranch?.id], queryFn: () => api.get(`/reports/high-consumption${bp}`).then(r => r.data.data),  enabled: tab === 'consumption' });
  const { data: inventoryData,   isLoading: iL } = useQuery({ queryKey: ['report-inv-value',    activeBranch?.id], queryFn: () => api.get(`/inventory${bp}`).then(r => r.data.data),                  enabled: tab === 'inventory-value' });
  const { data: priceHistory,    isLoading: pH } = useQuery({ queryKey: ['report-price-history', activeBranch?.id], queryFn: () => api.get(`/inventory/transactions${bp}`).then(r => r.data.data), enabled: tab === 'price-history' });

  const wastagePie = wastageData?.byReason?.map((r: any) => ({ name: r.reason, value: r._sum?.quantity || 0 })) || [];
  const costBars   = costData?.map((c: any) => ({ name: c.name?.substring(0, 14), base: c.baseCost, actual: c.avgActualCost })) || [];
  const consumBars = consumptionData?.map((h: any) => ({ name: h.product?.name?.substring(0, 14) || '', qty: h._sum?.quantity || 0 })) || [];

  const invValueByBranch: Record<string, number> = {};
  (inventoryData || []).forEach((row: any) => {
    const bName = row.branch?.name || 'Unknown';
    invValueByBranch[bName] = (invValueByBranch[bName] || 0) + row.quantity * (row.product?.costPrice || 0);
  });
  const invValueBars = Object.entries(invValueByBranch).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));

  const priceHistoryLines = (() => {
    if (!priceHistory) return [];
    const receipts = priceHistory.filter((tx: any) => tx.type === 'RECEIPT');
    const byDate: Record<string, number[]> = {};
    receipts.forEach((tx: any) => {
      const d = tx.createdAt?.substring(0, 10);
      if (!d) return;
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(tx.quantity);
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([date, qtys]) => ({ date, totalQty: qtys.reduce((s, q) => s + q, 0), count: qtys.length }));
  })();

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'wastage',         label: 'Wastage',         icon: '🗑️' },
    { key: 'cost',            label: 'Cost Variance',   icon: '💰' },
    { key: 'consumption',     label: 'Consumption',     icon: '📈' },
    { key: 'inventory-value', label: 'Inventory Value', icon: '🏪' },
    { key: 'price-history',   label: 'Price Trends',    icon: '📉' },
  ];

  const EXPORTS = ['requisitions', 'inventory', 'purchase-orders', 'wastage'];
  const [exportingType, setExportingType] = useState<string | null>(null);

  const buildExportPath = (type: string) => {
    const params = new URLSearchParams();
    if (activeBranch?.id) params.set('branchId', String(activeBranch.id));
    if (fromDate) params.set('from', fromDate);
    if (toDate)   params.set('to', toDate);
    const qs = params.toString();
    return `/reports/export/${type}/csv${qs ? `?${qs}` : ''}`;
  };

  const handleExport = async (type: string) => {
    setExportingType(type);
    try {
      const dateTag = fromDate ? `_${fromDate}` : '';
      await downloadCsv(buildExportPath(type), `${type}${dateTag}-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch {
      toast.error(`Export failed for ${type}`);
    } finally {
      setExportingType(null);
    }
  };

  const handlePrint = () => window.print();

  // Headline KPIs (tab-contextual)
  const kpis = (() => {
    switch (tab) {
      case 'wastage': {
        const totalQty = wastageData?.total?._sum?.quantity || 0;
        const records = wastageData?.total?._count || 0;
        return [
          { label: 'Total Wasted Qty', value: Number(totalQty).toLocaleString(), accent: true },
          { label: 'Wastage Records', value: Number(records).toLocaleString() },
          { label: 'Reasons Tracked', value: String(wastagePie.length) },
        ];
      }
      case 'cost':
        return [
          { label: 'Items Analyzed', value: String(costBars.length), accent: true },
          { label: 'Avg Base Cost', value: `${cur} ${(costBars.reduce((s: number, c: any) => s + (c.base || 0), 0) / (costBars.length || 1)).toFixed(2)}` },
          { label: 'Avg Actual Cost', value: `${cur} ${(costBars.reduce((s: number, c: any) => s + (c.actual || 0), 0) / (costBars.length || 1)).toFixed(2)}` },
        ];
      case 'consumption':
        return [
          { label: 'Top Items', value: String(consumBars.length), accent: true },
          { label: 'Total Qty', value: Number(consumBars.reduce((s: number, c: any) => s + (c.qty || 0), 0)).toLocaleString() },
        ];
      case 'inventory-value':
        return [
          { label: 'Total Stock Value', value: `${cur} ${invValueBars.reduce((s, r) => s + r.value, 0).toLocaleString()}`, accent: true },
          { label: 'Branches', value: String(invValueBars.length) },
        ];
      case 'price-history':
        return [
          { label: 'Days Tracked', value: String(priceHistoryLines.length), accent: true },
          { label: 'Total Received', value: Number(priceHistoryLines.reduce((s, p) => s + p.totalQty, 0)).toLocaleString() },
        ];
      default:
        return [];
    }
  })();

  return (
    <div>
      <PageHeader
        title={t('nav.reports')}
        subtitle="Analytics & Insights"
        actions={
          <button onClick={handlePrint} className="text-xs bg-surface border border-border text-fg-muted px-3 py-1.5 rounded-lg hover:bg-surface-2">
            🖨️ Print / PDF
          </button>
        }
      />

      {/* Export toolbar */}
      <div className="bg-surface rounded-2xl border border-border shadow-elev-sm p-4 mb-5">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-fg-muted mb-1">From</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="bg-bg border border-border rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent" />
            </div>
            <div>
              <label className="block text-xs text-fg-muted mb-1">To</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="bg-bg border border-border rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent" />
            </div>
            {(fromDate || toDate) && (
              <button onClick={() => { setFromDate(''); setToDate(''); }} className="text-xs text-fg-subtle hover:text-fg px-2 py-2">Clear</button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 lg:ms-auto">
            {EXPORTS.map(type => (
              <button
                key={type}
                onClick={() => handleExport(type)}
                disabled={exportingType === type}
                className="text-xs bg-accent-subtle border border-transparent text-accent-subtle-fg px-3 py-2 rounded-lg hover:opacity-90 capitalize disabled:opacity-50 font-medium"
              >
                {exportingType === type ? 'Exporting…' : `📥 ${type.replace('-', ' ')}`}
              </button>
            ))}
          </div>
        </div>
        {(fromDate || toDate) && (
          <p className="text-xs text-accent mt-3">📅 Filtering: {fromDate || 'start'} → {toDate || 'now'}</p>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1 scrollbar-hide">
        {TABS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition ${
              tab === key ? 'bg-accent text-accent-fg shadow-elev-sm' : 'bg-surface border border-border text-fg-muted hover:bg-surface-2'
            }`}
          >
            <span>{icon}</span> {label}
          </button>
        ))}
      </div>

      {/* KPI strip */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-5">
          {kpis.map((k, i) => <KpiCard key={i} label={k.label} value={k.value} accent={(k as any).accent} />)}
        </div>
      )}

      {/* Wastage */}
      {tab === 'wastage' && (wL ? <LoadingSpinner /> : (
        <Card title="Wastage by Reason" subtitle="Distribution of wasted quantity across reasons" icon="🗑️" onPrint={handlePrint}>
          {wastagePie.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie data={wastagePie} cx="50%" cy="50%" outerRadius={110} innerRadius={55} paddingAngle={2} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {wastagePie.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-fg-subtle py-12">{t('common.noData')}</p>}
        </Card>
      ))}

      {/* Cost Variance */}
      {tab === 'cost' && (cL ? <LoadingSpinner /> : (
        <Card title="Cost Variance" subtitle="Base cost vs. actual purchase price" icon="💰" onPrint={handlePrint}>
          {costBars.length > 0 ? (
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={costBars}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: AXIS }} />
                <YAxis tick={{ fontSize: 10, fill: AXIS }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="base"   fill="#0ea5e9" name="Base Cost"   radius={[4,4,0,0]} />
                <Bar dataKey="actual" fill="#f97316" name="Actual Cost" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-fg-subtle py-12">{t('common.noData')}</p>}
        </Card>
      ))}

      {/* High Consumption */}
      {tab === 'consumption' && (hL ? <LoadingSpinner /> : (
        <Card title="Top Consumed Items" subtitle="By requisition fulfillment" icon="📈" onPrint={handlePrint}>
          {consumBars.length > 0 ? (
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={consumBars}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: AXIS }} />
                <YAxis tick={{ fontSize: 10, fill: AXIS }} />
                <Tooltip />
                <Bar dataKey="qty" fill="#22c55e" name="Quantity" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-fg-subtle py-12">{t('common.noData')}</p>}
        </Card>
      ))}

      {/* Inventory Value by Branch */}
      {tab === 'inventory-value' && (iL ? <LoadingSpinner /> : (
        <div className="space-y-5">
          <Card title={`Inventory Value by Branch (${cur})`} subtitle="Current stock value on hand" icon="🏪" onPrint={handlePrint}>
            {invValueBars.length > 0 ? (
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={invValueBars}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: AXIS }} />
                  <YAxis tick={{ fontSize: 10, fill: AXIS }} tickFormatter={v => `${cur} ${v.toLocaleString()}`} />
                  <Tooltip formatter={(v: any) => [`${cur} ${Number(v).toLocaleString()}`, 'Value']} />
                  <Bar dataKey="value" fill="#8b5cf6" name={`Stock Value (${cur})`} radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-fg-subtle py-12">{t('common.noData')}</p>}
          </Card>
          {invValueBars.length > 0 && (
            <div className="bg-surface rounded-2xl border border-border shadow-elev-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-surface-2 border-b border-border">
                  <tr>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-fg-muted uppercase">Branch</th>
                    <th className="text-end px-4 py-3 text-xs font-semibold text-fg-muted uppercase">Stock Value ({cur})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invValueBars.sort((a, b) => b.value - a.value).map(row => (
                    <tr key={row.name} className="hover:bg-surface-2">
                      <td className="px-4 py-3 text-sm text-fg">{row.name}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-fg text-end">{cur} {row.value.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="bg-accent-subtle">
                    <td className="px-4 py-3 text-sm font-bold text-accent-subtle-fg">Total</td>
                    <td className="px-4 py-3 text-sm font-bold text-accent-subtle-fg text-end">
                      {cur} {invValueBars.reduce((s, r) => s + r.value, 0).toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {/* Price / Receipt Trends */}
      {tab === 'price-history' && (pH ? <LoadingSpinner /> : (
        <Card title="Receipt Volume Trend" subtitle="Total quantity received per day (last 30 days)" icon="📉" onPrint={handlePrint}>
          {priceHistoryLines.length > 0 ? (
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={priceHistoryLines}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: AXIS }} />
                <YAxis tick={{ fontSize: 10, fill: AXIS }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="totalQty" stroke="#0ea5e9" name="Total Qty Received" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="count"    stroke="#f97316" name="# Transactions"    dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-fg-subtle py-12">{t('common.noData')}</p>}
        </Card>
      ))}
    </div>
  );
}
