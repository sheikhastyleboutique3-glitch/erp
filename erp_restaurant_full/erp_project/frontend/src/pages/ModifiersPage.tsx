import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';

interface OptionRow {
  name: string;
  priceDelta: string;
  componentProductId: string;
  qtyToDeduct: string;
}
const emptyOption = (): OptionRow => ({ name: '', priceDelta: '0', componentProductId: '', qtyToDeduct: '0' });

export default function ModifiersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  // ----- Group builder -----
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [maxSelect, setMaxSelect] = useState('1');
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState<OptionRow[]>([emptyOption()]);

  const { data: groups, isLoading } = useQuery({
    queryKey: ['modifier-groups'],
    queryFn: () => api.get('/modifiers/groups').then((r) => r.data.data),
  });
  const { data: products } = useQuery({
    queryKey: ['products-for-modifiers'],
    queryFn: () => api.get('/products', { params: { limit: 500 } }).then((r) => r.data.data),
    staleTime: 60_000,
  });
  const productList: any[] = Array.isArray(products) ? products : products?.items ?? [];

  const resetGroupForm = () => {
    setName(''); setNameAr(''); setMaxSelect('1'); setRequired(false); setOptions([emptyOption()]);
  };

  const createGroup = useMutation({
    mutationFn: () =>
      api.post('/modifiers/groups', {
        name,
        nameAr: nameAr || undefined,
        maxSelect: parseInt(maxSelect, 10) || 1,
        required,
        options: options
          .filter((o) => o.name.trim())
          .map((o) => ({
            name: o.name.trim(),
            priceDelta: parseFloat(o.priceDelta) || 0,
            componentProductId: o.componentProductId ? parseInt(o.componentProductId, 10) : null,
            qtyToDeduct: parseFloat(o.qtyToDeduct) || 0,
          })),
      }),
    onSuccess: () => { toast.success(t('modifiers.groupCreated')); resetGroupForm(); qc.invalidateQueries({ queryKey: ['modifier-groups'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const removeGroup = useMutation({
    mutationFn: (id: number) => api.delete(`/modifiers/groups/${id}`),
    onSuccess: () => { toast.success(t('common.deleted')); qc.invalidateQueries({ queryKey: ['modifier-groups'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  // ----- Product assignment -----
  const [assignProductId, setAssignProductId] = useState('');
  const [checkedGroups, setCheckedGroups] = useState<number[]>([]);
  const { data: productGroups } = useQuery({
    queryKey: ['product-modifiers', assignProductId],
    queryFn: () => api.get(`/modifiers/product/${assignProductId}`).then((r) => r.data.data),
    enabled: !!assignProductId,
  });
  useEffect(() => {
    if (productGroups) setCheckedGroups(productGroups.map((g: any) => g.id));
  }, [productGroups]);

  const saveAssignment = useMutation({
    mutationFn: () => api.post(`/modifiers/product/${assignProductId}`, { groupIds: checkedGroups }),
    onSuccess: () => { toast.success(t('modifiers.assigned')); qc.invalidateQueries({ queryKey: ['modifier-groups'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const updateOption = (i: number, patch: Partial<OptionRow>) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));

  return (
    <div>
      <PageHeader title={t('nav.modifiers')} subtitle={t('modifiers.subtitle')} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Group builder */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <h3 className="text-sm font-semibold mb-3">{t('modifiers.newGroup')}</h3>
          <div className="grid grid-cols-2 gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('modifiers.groupName')} className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
            <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder={t('modifiers.groupNameAr')} className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-500 whitespace-nowrap">{t('modifiers.maxSelect')}</span>
              <input type="number" value={maxSelect} onChange={(e) => setMaxSelect(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="rounded border-gray-300" />
              {t('modifiers.required')}
            </label>
          </div>

          <div className="mt-3">
            <div className="text-xs font-semibold text-gray-500 mb-2">{t('modifiers.options')}</div>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="flex flex-wrap gap-2 items-center">
                  <input value={o.name} onChange={(e) => updateOption(i, { name: e.target.value })} placeholder={t('modifiers.optionName')} className="flex-1 min-w-[8rem] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
                  <input type="number" value={o.priceDelta} onChange={(e) => updateOption(i, { priceDelta: e.target.value })} placeholder="+price" className="w-20 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm" />
                  <select value={o.componentProductId} onChange={(e) => updateOption(i, { componentProductId: e.target.value })} className="w-32 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm">
                    <option value="">{t('modifiers.noStock')}</option>
                    {productList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input type="number" value={o.qtyToDeduct} onChange={(e) => updateOption(i, { qtyToDeduct: e.target.value })} placeholder={t('modifiers.qty')} className="w-20 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm" />
                  <button onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))} disabled={options.length === 1} className="text-red-600 text-sm px-1 disabled:opacity-30">✕</button>
                </div>
              ))}
            </div>
            <button onClick={() => setOptions((prev) => [...prev, emptyOption()])} className="mt-2 text-xs text-primary hover:underline">+ {t('modifiers.addOption')}</button>
          </div>

          <button disabled={!name || createGroup.isPending} onClick={() => createGroup.mutate()} className="mt-4 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50">
            {t('modifiers.saveGroup')}
          </button>
        </div>

        {/* Assign to product */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <h3 className="text-sm font-semibold mb-3">{t('modifiers.assignTitle')}</h3>
          <select value={assignProductId} onChange={(e) => setAssignProductId(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm mb-3">
            <option value="">{t('modifiers.selectProduct')}</option>
            {productList.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
          </select>
          {assignProductId && (
            <>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {(groups || []).map((g: any) => (
                  <label key={g.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checkedGroups.includes(g.id)}
                      onChange={(e) =>
                        setCheckedGroups((prev) => (e.target.checked ? [...prev, g.id] : prev.filter((x) => x !== g.id)))
                      }
                      className="rounded border-gray-300"
                    />
                    {g.name}
                    <span className="text-xs text-gray-400">({g.options?.length ?? 0})</span>
                  </label>
                ))}
              </div>
              <button onClick={() => saveAssignment.mutate()} disabled={saveAssignment.isPending} className="mt-3 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50">
                {t('modifiers.saveAssignment')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Existing groups */}
      <h3 className="text-sm font-semibold mt-6 mb-3">{t('modifiers.existing')}</h3>
      {isLoading ? <LoadingSpinner /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {(groups || []).map((g: any) => (
            <div key={g.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-sm">{g.name}</div>
                  <div className="text-xs text-gray-500">{g.required ? t('modifiers.required') : t('modifiers.optional')} · max {g.maxSelect} · {g.productLinks?.length ?? 0} {t('modifiers.products')}</div>
                </div>
                <button onClick={() => removeGroup.mutate(g.id)} className="text-xs text-red-600">{t('common.delete')}</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(g.options || []).map((o: any) => (
                  <span key={o.id} className="text-xs bg-gray-50 dark:bg-gray-800/60 rounded px-2 py-0.5">
                    {o.name}{o.priceDelta ? ` +${o.priceDelta.toFixed(2)}` : ''}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {!groups?.length && <p className="text-sm text-gray-400">{t('modifiers.empty')}</p>}
        </div>
      )}
    </div>
  );
}
