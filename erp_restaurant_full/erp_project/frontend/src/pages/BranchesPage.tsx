import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

export default function BranchesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', nameAr: '', address: '', phone: '', isWarehouse: false, cashFloat: '0', crNumber: '', baladiyaLicenseNo: '', licenseExpiryDate: '', isEnforcedLocked: false });

  const { data: branches, isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches').then(r => r.data.data),
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => editing
      ? api.patch(`/branches/${editing.id}`, data)
      : api.post('/branches', data),
    onSuccess: () => { toast.success(editing ? 'Updated' : 'Created'); qc.invalidateQueries({ queryKey: ['branches'] }); setModal(false); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const openEdit = (b: any) => {
    setEditing(b);
    setForm({ name: b.name, nameAr: b.nameAr, address: b.address || '', phone: b.phone || '', isWarehouse: b.isWarehouse, cashFloat: String(b.cashFloat ?? 0), crNumber: b.crNumber || '', baladiyaLicenseNo: b.baladiyaLicenseNo || '', licenseExpiryDate: b.licenseExpiryDate ? b.licenseExpiryDate.slice(0, 10) : '', isEnforcedLocked: !!b.isEnforcedLocked });
    setModal(true);
  };
  const openNew = () => {
    setEditing(null);
    setForm({ name: '', nameAr: '', address: '', phone: '', isWarehouse: false, cashFloat: '0', crNumber: '', baladiyaLicenseNo: '', licenseExpiryDate: '', isEnforcedLocked: false });
    setModal(true);
  };

  return (
    <div>
      <PageHeader
        title={t('nav.branches')}
        actions={
          <button onClick={openNew} className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
            + Add Branch
          </button>
        }
      />

      {isLoading ? <LoadingSpinner /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches?.map((b: any) => (
            <div key={b.id} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{b.name}</h3>
                  <p className="text-sm text-gray-500">{b.nameAr}</p>
                </div>
                <button onClick={() => openEdit(b)} className="text-gray-400 hover:text-brand-600 p-1 rounded-lg hover:bg-gray-100">
                  ✏️
                </button>
              </div>
              <div className="mt-3 space-y-1">
                {b.address && <p className="text-xs text-gray-500">📍 {b.address}</p>}
                {b.phone   && <p className="text-xs text-gray-500">📞 {b.phone}</p>}
                <div className="flex gap-2 mt-2">
                  {b.isWarehouse && (
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Warehouse</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    b.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {b.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Branch' : 'New Branch'} size="lg">
        <div className="grid grid-cols-2 gap-4">
          {[['name', 'Name (EN)'], ['nameAr', 'Name (AR)'], ['address', 'Address'], ['phone', 'Phone']].map(([key, label]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                value={(form as any)[key]}
                onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cash Float (petty cash)</label>
            <input
              type="number"
              min={0}
              step="any"
              value={form.cashFloat}
              onChange={e => setForm(p => ({ ...p, cashFloat: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Fixed petty cash kept in the branch for emergency local purchases.</p>
          </div>
          <div className="col-span-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isWarehouse} onChange={e => setForm(p => ({ ...p, isWarehouse: e.target.checked }))} className="rounded" />
              <span className="text-sm text-gray-700">Is Warehouse</span>
            </label>
          </div>

          {/* Qatar compliance */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CR Number</label>
            <input value={form.crNumber} onChange={e => setForm(p => ({ ...p, crNumber: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Baladiya License No.</label>
            <input value={form.baladiyaLicenseNo} onChange={e => setForm(p => ({ ...p, baladiyaLicenseNo: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">License Expiry</label>
            <input type="date" value={form.licenseExpiryDate} onChange={e => setForm(p => ({ ...p, licenseExpiryDate: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isEnforcedLocked} onChange={e => setForm(p => ({ ...p, isEnforcedLocked: e.target.checked }))} className="rounded" />
              <span className="text-sm text-red-700 font-medium">Enforce lock (suspend operations — CR/Baladiya non-compliance)</span>
            </label>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={() => setModal(false)} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium">{t('common.cancel')}</button>
          <button
            onClick={() => saveMutation.mutate({ ...form, cashFloat: Number(form.cashFloat) || 0, licenseExpiryDate: form.licenseExpiryDate || undefined })}
            disabled={saveMutation.isPending || !form.name}
            className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white py-2.5 rounded-xl text-sm font-medium"
          >
            {saveMutation.isPending ? 'Saving...' : t('common.save')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
