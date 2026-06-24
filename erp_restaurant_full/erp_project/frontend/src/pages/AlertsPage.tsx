import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const TYPE_ICONS: Record<string, string> = {
  EXPIRY_WARNING:    '📅',
  LOW_STOCK:         '📦',
  WASTAGE_THRESHOLD: '🗑️',
};

const TYPE_COLORS: Record<string, string> = {
  EXPIRY_WARNING:    'bg-orange-50 border-orange-200',
  LOW_STOCK:         'bg-yellow-50 border-yellow-200',
  WASTAGE_THRESHOLD: 'bg-red-50 border-red-200',
};

export default function AlertsPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { activeBranch } = useAuth();
  const isRTL = i18n.language === 'ar';

  // Scoped to the active branch (All Branches = no filter), matching the switcher.
  const { data: alerts, isLoading } = useQuery({
    queryKey: ['alerts', activeBranch?.id ?? 'all'],
    queryFn: () => api.get('/alerts', { params: activeBranch?.id ? { branchId: activeBranch.id } : {} }).then(r => r.data.data),
  });

  const markRead = useMutation({
    mutationFn: (id: number) => api.patch(`/alerts/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['alerts-count'] });
    },
  });

  const resolve = useMutation({
    mutationFn: (id: number) => api.patch(`/alerts/${id}/resolve`),
    onSuccess: () => {
      toast.success('Alert resolved');
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['alerts-count'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const unread = alerts?.filter((a: any) => !a.isRead) || [];
      await Promise.all(unread.map((a: any) => api.patch(`/alerts/${a.id}/read`)));
    },
    onSuccess: () => {
      toast.success('All alerts marked as read');
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['alerts-count'] });
    },
  });

  const unreadCount = alerts?.filter((a: any) => !a.isRead).length || 0;

  return (
    <div>
      <PageHeader
        title={t('nav.alerts')}
        subtitle={`${alerts?.length || 0} active alerts`}
        actions={
          unreadCount > 0 ? (
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="text-xs bg-brand-50 text-brand-700 px-3 py-1.5 rounded-lg font-medium hover:bg-brand-100 disabled:opacity-50"
            >
              {markAllRead.isPending ? 'Marking...' : `✓ Mark all ${unreadCount} as read`}
            </button>
          ) : null
        }
      />

      {/* Summary cards */}
      {alerts && alerts.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Active</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{alerts.length}</p>
          </div>
          <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
            <p className="text-xs text-yellow-600 uppercase tracking-wide">Unread</p>
            <p className="text-2xl font-bold text-yellow-700 mt-1">{unreadCount}</p>
          </div>
          <div className="bg-orange-50 rounded-xl border border-orange-200 p-4">
            <p className="text-xs text-orange-600 uppercase tracking-wide">Expiry Warnings</p>
            <p className="text-2xl font-bold text-orange-700 mt-1">
              {alerts.filter((a: any) => a.type === 'EXPIRY_WARNING').length}
            </p>
          </div>
        </div>
      )}

      {isLoading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {alerts?.map((a: any) => (
            <div
              key={a.id}
              className={`bg-white rounded-2xl border p-4 flex items-start gap-3 transition-all ${
                a.isRead ? 'border-gray-100 opacity-75' : `${TYPE_COLORS[a.type] || 'border-yellow-200 bg-yellow-50/50'}`
              }`}
            >
              <span className="text-2xl">{TYPE_ICONS[a.type] || '🔔'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">{isRTL ? a.titleAr || a.title : a.title}</p>
                  {!a.isRead && (
                    <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full">New</span>
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-0.5">{isRTL ? a.messageAr || a.message : a.message}</p>
                <div className="flex items-center gap-3 mt-2">
                  <p className="text-xs text-gray-400">{format(new Date(a.createdAt), 'MMM d, yyyy HH:mm')}</p>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {a.type.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {!a.isRead && (
                  <button
                    onClick={() => markRead.mutate(a.id)}
                    disabled={markRead.isPending}
                    className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1.5 rounded-lg hover:bg-blue-200 font-medium disabled:opacity-50"
                  >
                    Mark Read
                  </button>
                )}
                <button
                  onClick={() => resolve.mutate(a.id)}
                  disabled={resolve.isPending}
                  className="text-xs bg-green-100 text-green-700 px-2.5 py-1.5 rounded-lg hover:bg-green-200 font-medium disabled:opacity-50"
                >
                  ✓ Resolve
                </button>
              </div>
            </div>
          ))}
          {!alerts?.length && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">✅</p>
              <p className="text-lg font-medium">No active alerts</p>
              <p className="text-sm mt-1">All systems running smoothly</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
