import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import { format } from 'date-fns';

const ENTITIES = ['', 'product', 'requisition', 'inventory', 'user', 'branch', 'purchaseOrder', 'wastage', 'setting'];
const ACTIONS = ['', 'CREATE', 'UPDATE', 'DELETE', 'ARCHIVE', 'LOGIN', 'MANAGER_REVIEW', 'PROCUREMENT_UPDATE', 'CONFIRM_RECEIPT', 'DUPLICATE', 'BULK_IMPORT'];

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  ARCHIVE: 'bg-yellow-100 text-yellow-700',
  LOGIN:  'bg-purple-100 text-purple-700',
  RESET:  'bg-red-200 text-red-800',
  MANAGER_REVIEW: 'bg-indigo-100 text-indigo-700',
  PROCUREMENT_UPDATE: 'bg-cyan-100 text-cyan-700',
  CONFIRM_RECEIPT: 'bg-emerald-100 text-emerald-700',
  DUPLICATE: 'bg-orange-100 text-orange-700',
  BULK_IMPORT: 'bg-teal-100 text-teal-700',
};

export default function AuditLogPage() {
  const [entity, setEntity] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const buildParams = () => {
    const params: any = {};
    if (entity) params.entity = entity;
    if (actionFilter) params.action = actionFilter;
    if (search) params.search = search;
    if (fromDate) params.from = fromDate;
    if (toDate) params.to = toDate;
    return params;
  };

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit', entity, actionFilter, search, fromDate, toDate],
    queryFn: () => api.get('/audit', { params: buildParams() }).then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const clearFilters = () => { setEntity(''); setActionFilter(''); setSearch(''); setFromDate(''); setToDate(''); };
  const hasActiveFilters = actionFilter || search || fromDate || toDate;

  const handleExport = async () => {
    try {
      const res = await api.get('/audit', { params: { ...buildParams(), limit: 5000 } });
      const blob = new Blob([JSON.stringify(res.data.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0,10)}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Export failed'); }
  };

  return (
    <div>
      <PageHeader
        title="📜 Audit Log"
        subtitle={`${logs?.length || 0} records`}
        actions={
          <button onClick={handleExport} className="bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">
            📥 Export JSON
          </button>
        }
      />

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 start-3 flex items-center text-gray-400">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by entity ID..." className="w-full ps-9 pe-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border ${
          showFilters || hasActiveFilters ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}>
          ⚙️ Filters {hasActiveFilters && <span className="bg-brand-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{[actionFilter, search, fromDate, toDate].filter(Boolean).length}</span>}
        </button>
      </div>

      {showFilters && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">⚙️ Advanced Filters</p>
            {hasActiveFilters && <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-700">Clear All</button>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Action Type</label>
              <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                <option value="">All Actions</option>
                {ACTIONS.filter(Boolean).map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">From Date</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To Date</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
      )}

      {/* Entity filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5 scrollbar-hide">
        {ENTITIES.map(e => (
          <button key={e || 'all'} onClick={() => setEntity(e)} className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${
            entity === e ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}>
            {e || 'All'}
          </button>
        ))}
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Time</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">User</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Action</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Entity</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">ID</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Changes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs?.map((log: any) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{format(new Date(log.createdAt), 'MMM d, HH:mm:ss')}</td>
                    <td className="px-4 py-3">
                      {log.user ? <span className="text-sm text-gray-700">{log.user.firstName} {log.user.lastName}</span> : <span className="text-xs text-gray-400">System</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600'}`}>{log.action}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 capitalize">{log.entity}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono">{log.entityId || '—'}</td>
                    <td className="px-4 py-3 max-w-xs">
                      {(log.newValues || log.oldValues) ? (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-brand-600 hover:underline">View diff</summary>
                          <pre className="mt-1 text-gray-500 whitespace-pre-wrap break-all text-xs bg-gray-50 rounded p-2 max-h-32 overflow-y-auto">
                            {JSON.stringify(log.newValues ?? log.oldValues, null, 2)}
                          </pre>
                        </details>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
                {!logs?.length && (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-400">No audit records found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
