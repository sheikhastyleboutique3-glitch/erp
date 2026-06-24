import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

/**
 * Units of Measure management — SUPER_ADMIN only.
 * Backend: GET/POST/PATCH /units
 */
export default function UnitsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', nameAr: '', abbreviation: '' });

  const { data: units, isLoading } = useQuery({
    queryKey: ['units'],
    queryFn: () => api.get('/units').then(r => r.data.data),
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      editing
        ? api.patch(`/units/${editing.id}`, data)
        : api.post('/units', data),
    onSuccess: () => {
      toast.success(editing ? 'Unit updated' : 'Unit created');
      qc.invalidateQueries({ queryKey: ['units'] });
      setModal(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', nameAr: '', abbreviation: '' });
    setModal(true);
  };

  const openEdit = (u: any) => {
    setEditing(u);
    setForm({ name: u.name, nameAr: u.nameAr || '', abbreviation: u.abbreviation });
    setModal(true);
  };

  const handleSave = () => {
    if (!form.name || !form.abbreviation) {
      toast.error('Name and abbreviation are required');
      return;
    }
    saveMutation.mutate(form);
  };

  return (
    <div>
      <PageHeader
        title="📏 Units of Measure"
        subtitle="Manage measurement units used across products and inventory"
        actions={
          <button
            onClick={openNew}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-medium"
          >
            + Add Unit
          </button>
        }
      />

      {isLoading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-start px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Name (EN)</th>
                  <th className="text-start px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Name (AR)</th>
                  <th className="text-start px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Abbreviation</th>
                  <th className="text-start px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-start px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {units?.map((u: any) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{u.name}</td>
                    <td className="px-5 py-3 text-sm text-gray-600 font-arabic">{u.nameAr || '—'}</td>
                    <td className="px-5 py-3">
                      <span className="inline-block bg-brand-50 text-brand-700 text-xs font-bold px-3 py-1 rounded-full font-mono">
                        {u.abbreviation}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => openEdit(u)}
                        className="text-xs text-brand-600 font-medium hover:underline"
                      >
                        {t('common.edit')}
                      </button>
                    </td>
                  </tr>
                ))}
                {!units?.length && (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-gray-400">{t('common.noData')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={modal}
        onClose={() => { setModal(false); setEditing(null); }}
        title={editing ? `Edit Unit: ${editing.name}` : 'New Unit of Measure'}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name (EN) *</label>
            <input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Kilogram"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name (AR)</label>
            <input
              value={form.nameAr}
              onChange={e => setForm(p => ({ ...p, nameAr: e.target.value }))}
              placeholder="مثال: كيلوغرام"
              dir="rtl"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-arabic focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Abbreviation *</label>
            <input
              value={form.abbreviation}
              onChange={e => setForm(p => ({ ...p, abbreviation: e.target.value }))}
              placeholder="e.g. kg"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-xs text-gray-400 mt-1">Short code shown on product cards and reports.</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => { setModal(false); setEditing(null); }}
              className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending || !form.name || !form.abbreviation}
              className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white py-2.5 rounded-xl text-sm font-medium"
            >
              {saveMutation.isPending ? 'Saving...' : t('common.save')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
