import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';

/**
 * Menu / "86" board — quickly mark sellable items temporarily unavailable
 * (out of stock) without removing them from the menu. Available to FOH + kitchen.
 */
export default function MenuPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: products, isLoading } = useQuery({
    queryKey: ['menu-products', search],
    queryFn: () => api.get('/products', { params: { sellable: true, ...(search && { search }) } }).then((r) => r.data.data),
  });

  const toggle = useMutation({
    mutationFn: ({ id, isAvailable }: { id: number; isAvailable: boolean }) =>
      api.patch(`/products/${id}/availability`, { isAvailable }),
    onSuccess: (_d, v) => { toast.success(v.isAvailable ? t('menu.backOn') : t('menu.eightySixed')); qc.invalidateQueries({ queryKey: ['menu-products'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  // Group by category for a tidy board.
  const groups: Record<string, any[]> = {};
  (products || []).forEach((p: any) => {
    const k = p.category?.name || t('menu.uncategorized');
    (groups[k] = groups[k] || []).push(p);
  });

  return (
    <div>
      <PageHeader title={t('nav.menu')} subtitle={t('menu.subtitle')} />
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('menu.search')}
        className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm mb-4"
      />
      {isLoading ? <LoadingSpinner /> : (
        <div className="space-y-5">
          {Object.entries(groups).map(([cat, items]) => (
            <div key={cat}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">{cat}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {items.map((p: any) => {
                  const on = p.isAvailable !== false;
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggle.mutate({ id: p.id, isAvailable: !on })}
                      className={`flex items-center justify-between gap-2 rounded-xl border p-3 text-start transition ${on
                        ? 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
                        : 'border-red-300 bg-red-50 dark:bg-red-500/10'}`}
                    >
                      <div className="min-w-0">
                        <div className={`text-sm font-medium ${on ? '' : 'line-through text-gray-500'}`}>{p.name}</div>
                        <div className="text-xs text-gray-400">{p.sku}</div>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${on
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                        : 'bg-red-600 text-white'}`}>
                        {on ? t('menu.available') : t('menu.eightySix')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {!products?.length && <p className="text-sm text-gray-400">{t('menu.empty')}</p>}
        </div>
      )}
    </div>
  );
}
