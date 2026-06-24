import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';

interface ComponentRow {
  componentProductId: string;
  quantity: string;
  unitId: string;
  wastePct: string;
}

const emptyRow = (): ComponentRow => ({ componentProductId: '', quantity: '', unitId: '', wastePct: '' });

export default function RecipesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [productId, setProductId] = useState('');
  const [name, setName] = useState('');
  const [yieldQty, setYieldQty] = useState('1');
  const [prepLossPct, setPrepLossPct] = useState('0');
  const [cookingLossPct, setCookingLossPct] = useState('0');
  const [wastePct, setWastePct] = useState('0');
  const [rows, setRows] = useState<ComponentRow[]>([emptyRow()]);

  const { data: recipes, isLoading } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => api.get('/recipes').then((r) => r.data.data),
  });
  const { data: products } = useQuery({
    queryKey: ['products-for-recipes'],
    queryFn: () => api.get('/products', { params: { limit: 500 } }).then((r) => r.data.data),
    staleTime: 60_000,
  });
  const { data: units } = useQuery({
    queryKey: ['units-for-recipes'],
    queryFn: () => api.get('/units').then((r) => r.data.data),
    staleTime: 60_000,
  });

  const productList: any[] = Array.isArray(products) ? products : products?.items ?? [];
  const productName = (id: number) => {
    const p = productList.find((x) => x.id === id);
    return p ? p.name : `#${id}`;
  };

  const resetForm = () => {
    setProductId(''); setName(''); setYieldQty('1');
    setPrepLossPct('0'); setCookingLossPct('0'); setWastePct('0');
    setRows([emptyRow()]);
  };

  const updateRow = (i: number, patch: Partial<ComponentRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const createRecipe = useMutation({
    mutationFn: () => {
      const components = rows
        .filter((r) => r.componentProductId && parseFloat(r.quantity) > 0)
        .map((r) => ({
          componentProductId: parseInt(r.componentProductId, 10),
          quantity: parseFloat(r.quantity),
          unitId: r.unitId ? parseInt(r.unitId, 10) : undefined,
          wastePct: r.wastePct ? parseFloat(r.wastePct) : 0,
        }));
      if (!components.length) throw new Error(t('recipes.needComponent'));
      return api.post('/recipes', {
        productId: parseInt(productId, 10),
        name,
        yieldQty: parseFloat(yieldQty) || 1,
        prepLossPct: parseFloat(prepLossPct) || 0,
        cookingLossPct: parseFloat(cookingLossPct) || 0,
        wastePct: parseFloat(wastePct) || 0,
        components,
      });
    },
    onSuccess: () => { toast.success(t('recipes.created')); resetForm(); qc.invalidateQueries({ queryKey: ['recipes'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || e.message || 'Failed'),
  });

  const setActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => api.patch(`/recipes/${id}/active`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const approve = useMutation({
    mutationFn: (id: number) => api.patch(`/recipes/${id}/approve`, {}),
    onSuccess: () => { toast.success(t('recipes.approved')); qc.invalidateQueries({ queryKey: ['recipes'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/recipes/${id}`),
    onSuccess: () => { toast.success(t('common.deleted')); qc.invalidateQueries({ queryKey: ['recipes'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const showCost = useMutation({
    mutationFn: (id: number) => api.get(`/recipes/${id}/cost`).then((r) => r.data.data ?? r.data),
    onSuccess: (data: any) => toast.success(`${t('recipes.unitCost')}: ${Number(data.unitCost).toFixed(2)} (${t('recipes.batchCost')} ${Number(data.batchCost).toFixed(2)})`, { duration: 5000 }),
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  return (
    <div>
      <PageHeader title={t('nav.recipes')} subtitle={t('recipes.subtitle')} />

      {/* Create recipe */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 mb-5">
        <h3 className="text-sm font-semibold mb-3">{t('recipes.newRecipe')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <select value={productId} onChange={(e) => setProductId(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm">
            <option value="">{t('recipes.selectProduct')}</option>
            {productList.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('recipes.namePlaceholder')}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 text-sm">
            <span className="text-gray-500 whitespace-nowrap">{t('recipes.yieldQty')}</span>
            <input type="number" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-gray-500 whitespace-nowrap">{t('recipes.prepLoss')}%</span>
            <input type="number" value={prepLossPct} onChange={(e) => setPrepLossPct(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-gray-500 whitespace-nowrap">{t('recipes.cookLoss')}%</span>
            <input type="number" value={cookingLossPct} onChange={(e) => setCookingLossPct(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-gray-500 whitespace-nowrap">{t('recipes.waste')}%</span>
            <input type="number" value={wastePct} onChange={(e) => setWastePct(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
          </label>
        </div>

        {/* Components (BOM) */}
        <div className="mt-4">
          <div className="text-xs font-semibold text-gray-500 mb-2">{t('recipes.components')}</div>
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex flex-wrap gap-2 items-center">
                <select value={row.componentProductId} onChange={(e) => updateRow(i, { componentProductId: e.target.value })}
                  className="flex-1 min-w-[10rem] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm">
                  <option value="">{t('recipes.selectComponent')}</option>
                  {productList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input type="number" value={row.quantity} onChange={(e) => updateRow(i, { quantity: e.target.value })} placeholder={t('recipes.qty')}
                  className="w-24 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
                <select value={row.unitId} onChange={(e) => updateRow(i, { unitId: e.target.value })}
                  className="w-28 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm">
                  <option value="">{t('recipes.unit')}</option>
                  {(units || []).map((u: any) => <option key={u.id} value={u.id}>{u.abbreviation || u.name}</option>)}
                </select>
                <input type="number" value={row.wastePct} onChange={(e) => updateRow(i, { wastePct: e.target.value })} placeholder={`${t('recipes.waste')}%`}
                  className="w-24 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
                <button onClick={() => removeRow(i)} disabled={rows.length === 1}
                  className="text-red-600 text-sm px-2 disabled:opacity-30">✕</button>
              </div>
            ))}
          </div>
          <button onClick={addRow} className="mt-2 text-xs text-primary hover:underline">+ {t('recipes.addComponent')}</button>
        </div>

        <button disabled={!productId || !name || createRecipe.isPending} onClick={() => createRecipe.mutate()}
          className="mt-4 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50">
          {t('recipes.saveRecipe')}
        </button>
      </div>

      {/* Existing recipes */}
      {isLoading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {(recipes || []).map((rec: any) => (
            <div key={rec.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <div className="flex flex-wrap justify-between items-start gap-2">
                <div>
                  <div className="font-medium text-sm">
                    {rec.name} <span className="text-gray-400">· {rec.product?.name ?? productName(rec.productId)}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    v{rec.version} · {t('recipes.yieldQty')} {rec.yieldQty}
                    {rec.isActive && <span className="ms-2 text-emerald-600">● {t('recipes.active')}</span>}
                    {rec.isApproved && <span className="ms-2 text-sky-600">✓ {t('recipes.approvedTag')}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => showCost.mutate(rec.id)} className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800">{t('recipes.cost')}</button>
                  <button onClick={() => setActive.mutate({ id: rec.id, isActive: !rec.isActive })} className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800">
                    {rec.isActive ? t('recipes.deactivate') : t('recipes.activate')}
                  </button>
                  {!rec.isApproved && <button onClick={() => approve.mutate(rec.id)} className="text-xs px-2 py-1 rounded bg-sky-100 text-sky-700 dark:bg-sky-500/15">{t('recipes.approve')}</button>}
                  <button onClick={() => remove.mutate(rec.id)} className="text-xs px-2 py-1 rounded text-red-600">{t('common.delete')}</button>
                </div>
              </div>
              {Array.isArray(rec.components) && rec.components.length > 0 && (
                <div className="mt-3 text-xs text-gray-600 dark:text-gray-400">
                  {rec.components.map((c: any) => (
                    <span key={c.id} className="inline-block bg-gray-50 dark:bg-gray-800/60 rounded px-2 py-0.5 me-1 mb-1">
                      {c.componentProduct?.name ?? productName(c.componentProductId)} · {c.quantity}{c.unit?.abbreviation ? ` ${c.unit.abbreviation}` : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {!recipes?.length && <p className="text-sm text-gray-400">{t('recipes.empty')}</p>}
        </div>
      )}
    </div>
  );
}
