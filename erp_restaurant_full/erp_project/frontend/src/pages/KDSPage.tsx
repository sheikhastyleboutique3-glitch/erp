import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';

type KdsStatus = 'QUEUED' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';

const NEXT: Record<string, { label: string; status: KdsStatus }> = {
  QUEUED: { label: 'Start', status: 'PREPARING' },
  PREPARING: { label: 'Ready', status: 'READY' },
  READY: { label: 'Served', status: 'SERVED' },
};
const COLUMN_STYLE: Record<string, string> = {
  QUEUED: 'border-gray-300 dark:border-gray-700',
  PREPARING: 'border-amber-400',
  READY: 'border-green-500',
};

export default function KDSPage() {
  const { t } = useTranslation();
  const { activeBranch } = useAuth();
  const qc = useQueryClient();

  const { data: board, isLoading } = useQuery({
    queryKey: ['kds-board', activeBranch?.id ?? 'all'],
    queryFn: () =>
      api
        .get('/kds/board', { params: activeBranch?.id ? { branchId: activeBranch.id } : {} })
        .then((r) => r.data.data),
    refetchInterval: 8_000,
  });

  const advance = useMutation({
    mutationFn: ({ id, status }: { id: number; status: KdsStatus }) =>
      api.patch(`/kds/items/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kds-board'] }),
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const columns: KdsStatus[] = ['QUEUED', 'PREPARING', 'READY'];

  return (
    <div>
      <PageHeader title={t('nav.kds')} subtitle={activeBranch?.name} />
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {columns.map((col) => {
            const items = board?.[col] ?? [];
            return (
              <div key={col} className={`rounded-xl border-t-4 ${COLUMN_STYLE[col]} bg-gray-50 dark:bg-gray-900/50 p-3`}>
                <h3 className="font-semibold text-sm mb-3 flex justify-between">
                  <span>{col}</span>
                  <span className="text-gray-400">{items.length}</span>
                </h3>
                <div className="space-y-3">
                  {items.map((it: any) => (
                    <div key={it.id} className="rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{it.product?.name}</div>
                          <div className="text-xs text-gray-500">
                            ×{it.quantity} · {it.order?.orderNo}
                            {it.order?.tableName ? ` · ${it.order.tableName}` : ''} · {it.order?.channel}
                          </div>
                          {Array.isArray(it.modifiers) && it.modifiers.length > 0 && (
                            <div className="text-xs font-medium text-amber-600 dark:text-amber-400 mt-1">
                              → {it.modifiers.map((m: any) => m.name).filter(Boolean).join(', ')}
                            </div>
                          )}
                          {it.notes && <div className="text-xs text-gray-500 mt-0.5 italic">* {it.notes}</div>}
                        </div>
                      </div>
                      {NEXT[col] && (
                        <button
                          onClick={() => advance.mutate({ id: it.id, status: NEXT[col].status })}
                          className="mt-2 w-full py-1.5 rounded-lg bg-primary text-white text-xs font-medium"
                        >
                          {NEXT[col].label}
                        </button>
                      )}
                    </div>
                  ))}
                  {!items.length && <p className="text-xs text-gray-400 text-center py-6">Empty</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
