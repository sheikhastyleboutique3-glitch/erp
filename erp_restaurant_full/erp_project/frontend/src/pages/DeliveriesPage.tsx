import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import StatusBadge from '../components/StatusBadge';

const NEXT: Record<string, string> = {
  ASSIGNED: 'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'DELIVERED',
};

export default function DeliveriesPage() {
  const { t } = useTranslation();
  const { user, activeBranch } = useAuth();
  const qc = useQueryClient();
  const isDriver = user?.role === 'DRIVER';
  const branchId = activeBranch?.id;

  const { data: deliveries, isLoading } = useQuery({
    queryKey: ['deliveries', isDriver ? 'mine' : branchId ?? 'all'],
    queryFn: () =>
      (isDriver
        ? api.get('/deliveries/mine')
        : api.get('/deliveries', { params: branchId ? { branchId } : {} })
      ).then((r) => r.data.data),
    refetchInterval: 20_000,
  });

  // Manager: list of drivers to assign.
  const { data: users } = useQuery({
    queryKey: ['users-drivers'],
    queryFn: () => api.get('/users').then((r) => r.data.data),
    enabled: !isDriver,
    staleTime: 60_000,
    retry: false,
  });
  const drivers = (users || []).filter((u: any) => u.role === 'DRIVER');

  const assign = useMutation({
    mutationFn: ({ orderId, driverId }: { orderId: number; driverId: number | null }) =>
      api.post('/deliveries/assign', { orderId, driverId }),
    onSuccess: () => { toast.success(t('deliveries.assigned')); qc.invalidateQueries({ queryKey: ['deliveries'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.patch(`/deliveries/${id}/status`, { status }),
    onSuccess: () => { toast.success(t('deliveries.updated')); qc.invalidateQueries({ queryKey: ['deliveries'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const driverName = (id?: number | null) => {
    const d = (users || []).find((u: any) => u.id === id);
    return d ? `${d.firstName} ${d.lastName}` : id ? `#${id}` : t('deliveries.unassigned');
  };

  return (
    <div>
      <PageHeader title={t('nav.deliveries')} subtitle={isDriver ? t('deliveries.myRuns') : activeBranch?.name} />
      {isLoading ? <LoadingSpinner /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {(deliveries || []).map((d: any) => (
            <div key={d.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{d.order?.orderNo ?? `#${d.orderId}`}</div>
                  <div className="text-xs text-gray-500">
                    {Number(d.order?.total ?? 0).toFixed(2)}
                    {d.phone ? ` · ${d.phone}` : ''}
                  </div>
                  {d.address && <div className="text-xs text-gray-500 mt-0.5">{d.address}</div>}
                </div>
                <StatusBadge status={d.status} size="sm" />
              </div>

              {!isDriver && (
                <div className="mt-3">
                  <select
                    value={d.driverId ?? ''}
                    onChange={(e) => assign.mutate({ orderId: d.orderId, driverId: e.target.value ? parseInt(e.target.value, 10) : null })}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-xs"
                  >
                    <option value="">{t('deliveries.unassigned')}</option>
                    {drivers.map((dr: any) => <option key={dr.id} value={dr.id}>{dr.firstName} {dr.lastName}</option>)}
                  </select>
                </div>
              )}
              {isDriver && <div className="text-xs text-gray-500 mt-2">{t('deliveries.driver')}: {driverName(d.driverId)}</div>}

              {NEXT[d.status] && (
                <button
                  onClick={() => setStatus.mutate({ id: d.id, status: NEXT[d.status] })}
                  className="w-full mt-3 py-2 rounded-lg bg-primary text-white text-sm font-medium"
                >
                  {t(`deliveries.action.${NEXT[d.status]}`)}
                </button>
              )}
            </div>
          ))}
          {!deliveries?.length && <p className="text-sm text-gray-400 col-span-full">{t('deliveries.empty')}</p>}
        </div>
      )}
    </div>
  );
}
