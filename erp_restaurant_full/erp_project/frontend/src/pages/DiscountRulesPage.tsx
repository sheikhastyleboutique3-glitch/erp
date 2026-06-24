import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';

interface RuleForm {
  name: string;
  nameAr?: string;
  scope: string;
  type: string;
  value: number;
  minOrder: number;
  requiresManagerApproval: boolean;
}

const EMPTY: RuleForm = {
  name: '',
  nameAr: '',
  scope: 'ORDER',
  type: 'PERCENT',
  value: 0,
  minOrder: 0,
  requiresManagerApproval: false,
};

export default function DiscountRulesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<RuleForm>(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);

  const { data: rules, isLoading } = useQuery({
    queryKey: ['discount-rules'],
    queryFn: () => api.get('/discount-rules').then((r) => r.data.data),
  });

  const save = useMutation({
    mutationFn: () =>
      editId ? api.patch(`/discount-rules/${editId}`, form) : api.post('/discount-rules', form),
    onSuccess: () => {
      toast.success(t('common.saved'));
      qc.invalidateQueries({ queryKey: ['discount-rules'] });
      qc.invalidateQueries({ queryKey: ['discount-rules-active'] });
      setForm(EMPTY);
      setEditId(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/discount-rules/${id}`),
    onSuccess: () => {
      toast.success(t('common.deleted'));
      qc.invalidateQueries({ queryKey: ['discount-rules'] });
    },
  });

  const startEdit = (r: any) => {
    setEditId(r.id);
    setForm({
      name: r.name,
      nameAr: r.nameAr ?? '',
      scope: r.scope,
      type: r.type,
      value: r.value,
      minOrder: r.minOrder,
      requiresManagerApproval: r.requiresManagerApproval,
    });
  };

  return (
    <div>
      <PageHeader title={t('nav.discountRules')} subtitle={t('discountRules.subtitle')} />

      <div className="grid md:grid-cols-3 gap-5">
        <div className="md:col-span-2">
          {isLoading ? <LoadingSpinner /> : (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase text-gray-400 border-b border-gray-100 dark:border-gray-800">
                    <th className="text-start p-3">{t('discountRules.name')}</th>
                    <th className="text-start p-3">{t('discountRules.scope')}</th>
                    <th className="text-start p-3">{t('discountRules.type')}</th>
                    <th className="text-end p-3">{t('discountRules.value')}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {(rules || []).map((r: any) => (
                    <tr key={r.id} className={`border-b border-gray-50 dark:border-gray-800/50 ${!r.isActive ? 'opacity-40' : ''}`}>
                      <td className="p-3 font-medium">
                        {r.name}
                        {r.requiresManagerApproval && <span className="ml-2 text-[9px] uppercase bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">{t('discountRules.approval')}</span>}
                      </td>
                      <td className="p-3 text-gray-500">{r.scope}</td>
                      <td className="p-3 text-gray-500">{r.type}</td>
                      <td className="p-3 text-end">{r.type === 'PERCENT' ? `${r.value}%` : r.value}</td>
                      <td className="p-3 text-end whitespace-nowrap">
                        <button onClick={() => startEdit(r)} className="text-xs text-primary mr-3">{t('common.edit')}</button>
                        <button onClick={() => remove.mutate(r.id)} className="text-xs text-red-600">{t('common.delete')}</button>
                      </td>
                    </tr>
                  ))}
                  {!rules?.length && (
                    <tr><td colSpan={5} className="p-6 text-center text-gray-400">{t('discountRules.empty')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create / edit */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3 h-fit">
          <div className="text-sm font-semibold">{editId ? t('common.edit') : t('discountRules.add')}</div>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t('discountRules.name')}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          />
          <input
            value={form.nameAr}
            onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
            placeholder={t('discountRules.nameAr')}
            dir="rtl"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={form.scope}
              onChange={(e) => setForm({ ...form, scope: e.target.value })}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm"
            >
              <option value="ORDER">ORDER</option>
              <option value="ITEM">ITEM</option>
              <option value="CATEGORY">CATEGORY</option>
            </select>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm"
            >
              <option value="PERCENT">PERCENT</option>
              <option value="FIXED">FIXED</option>
              <option value="BOGO">BOGO</option>
            </select>
          </div>
          <label className="block text-xs text-gray-500">{t('discountRules.value')}
            <input
              type="number" min={0} step="0.5"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: parseFloat(e.target.value) || 0 })}
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs text-gray-500">{t('discountRules.minOrder')}
            <input
              type="number" min={0}
              value={form.minOrder}
              onChange={(e) => setForm({ ...form, minOrder: parseFloat(e.target.value) || 0 })}
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.requiresManagerApproval}
              onChange={(e) => setForm({ ...form, requiresManagerApproval: e.target.checked })}
            />
            {t('discountRules.requiresApproval')}
          </label>
          <div className="flex gap-2">
            <button
              disabled={!form.name || save.isPending}
              onClick={() => save.mutate()}
              className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50"
            >
              {editId ? t('common.save') : t('common.add')}
            </button>
            {editId && (
              <button onClick={() => { setEditId(null); setForm(EMPTY); }} className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm">
                {t('common.cancel')}
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-400">{t('discountRules.note')}</p>
        </div>
      </div>
    </div>
  );
}
