import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api, { downloadCsv } from '../lib/api';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const ALL_STATUSES = [
  'SUBMITTED', 'MANAGER_APPROVED', 'MANAGER_MODIFIED', 'MANAGER_CANCELLED',
  'ORDER_PLACED_WITH_SUPPLIER', 'RECEIVED_AT_WAREHOUSE', 'DISPATCHED_TO_BRANCH', 'CONFIRMED_RECEIPT',
];
const PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];
const priorityColors: Record<string, string> = {
  URGENT: 'bg-red-100 text-red-700',
  HIGH: 'bg-orange-100 text-orange-700',
  NORMAL: 'bg-gray-100 text-gray-600',
  LOW: 'bg-blue-100 text-blue-600',
};

export default function RequisitionsPage() {
  const { t, i18n } = useTranslation();
  const { user, activeBranch } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isRTL = i18n.language === 'ar';
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [exporting, setExporting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const isAdmin = ['SUPER_ADMIN', 'PROCUREMENT', 'WAREHOUSE'].includes(user?.role || '');

  const buildParams = () => {
    const params: any = {};
    if (statusFilter) params.status = statusFilter;
    if (activeBranch?.id) params.branchId = activeBranch.id;
    if (search) params.search = search;
    if (priorityFilter) params.priority = priorityFilter;
    if (departmentFilter) params.department = departmentFilter;
    if (fromDate) params.from = fromDate;
    if (toDate) params.to = toDate;
    return params;
  };

  const { data: requisitions, isLoading } = useQuery({
    queryKey: ['requisitions', statusFilter, activeBranch?.id, search, priorityFilter, departmentFilter, fromDate, toDate],
    queryFn: () => api.get('/requisitions', { params: buildParams() }).then(r => r.data.data),
    refetchInterval: 30000,
  });

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches').then(r => r.data.data),
    enabled: isAdmin,
  });

  const canCreate = ['KITCHEN', 'BARISTA', 'PASTRY', 'CASHIER', 'CLEANER', 'BRANCH_MANAGER', 'SUPER_ADMIN'].includes(user?.role || '');

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (activeBranch?.id) params.set('branchId', String(activeBranch.id));
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      // Carry the on-screen filters into the export so the CSV matches the table.
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (departmentFilter) params.set('department', departmentFilter);
      const qs = params.toString();
      await downloadCsv(`/reports/export/requisitions/csv${qs ? `?${qs}` : ''}`, `requisitions-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setSearch(''); setPriorityFilter(''); setDepartmentFilter(''); setFromDate(''); setToDate(''); setStatusFilter('');
  };
  const hasActiveFilters = search || priorityFilter || departmentFilter || fromDate || toDate;

  // Extract unique departments from data
  const departments = [...new Set((requisitions || []).map((r: any) => r.department as string).filter(Boolean))] as string[];

  return (
    <div>
      <PageHeader
        title={t('requisition.title')}
        subtitle={`${requisitions?.length || 0} requisitions`}
        actions={
          <div className="flex gap-2">
            {canCreate && (
              <button onClick={() => navigate('/catalog')} className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
                + {t('requisition.new')}
              </button>
            )}
            <button onClick={handleExport} disabled={exporting} className="bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
              {exporting ? 'Exporting...' : '📊 Export CSV'}
            </button>
          </div>
        }
      />

      {/* Search + Advanced Filters Toggle */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 start-3 flex items-center text-gray-400">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by requisition number..." className="w-full ps-9 pe-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border ${
          showFilters || hasActiveFilters ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}>
          ⚙️ Filters {hasActiveFilters && <span className="bg-brand-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{[search, priorityFilter, departmentFilter, fromDate, toDate].filter(Boolean).length}</span>}
        </button>
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">⚙️ Advanced Filters</p>
            {hasActiveFilters && <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-700">Clear All</button>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Priority</label>
              <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                <option value="">All Priorities</option>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Department</label>
              <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                <option value="">All Departments</option>
                {departments.map((d: string) => <option key={d} value={d}>{d}</option>)}
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

      {/* Status filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5 scrollbar-hide">
        <button onClick={() => setStatusFilter('')} className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium ${!statusFilter ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          {t('common.all')}
        </button>
        {ALL_STATUSES.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium ${statusFilter === s ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {t(`requisition.status.${s}`)}
          </button>
        ))}
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {!requisitions?.length ? (
            <div className="text-center py-16"><p className="text-4xl mb-3">📋</p><p className="text-gray-500">{t('common.noData')}</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Req No.</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Branch / Dept</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Priority</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('common.status')}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Items</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('common.date')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {requisitions.map((req: any) => (
                    <tr key={req.id} onClick={() => navigate(`/requisitions/${req.id}`)} className="hover:bg-gray-50 cursor-pointer">
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold text-brand-700">{req.requisitionNo}</p>
                        <p className="text-xs text-gray-400">{req.createdBy?.firstName} {req.createdBy?.lastName}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-900">{isRTL ? req.branch?.nameAr : req.branch?.name}</p>
                        <p className="text-xs text-gray-500">{req.department}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColors[req.priority] || ''}`}>{req.priority}</span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={req.status} size="sm" /></td>
                      <td className="px-4 py-3 text-sm text-gray-600">{req._count?.items}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{format(new Date(req.createdAt), 'MMM d, HH:mm')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
