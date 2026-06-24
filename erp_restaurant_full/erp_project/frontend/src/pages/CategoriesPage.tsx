import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

export default function CategoriesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', nameAr: '', icon: '', description: '', sortOrder: '0', station: '' });
  const { data: categories, isLoading } = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/categories').then(r => r.data.data) });
  const saveMutation = useMutation({ mutationFn: (data: any) => editing ? api.patch(`/categories/${editing.id}`, data) : api.post('/categories', data), onSuccess: () => { toast.success(editing ? 'Updated' : 'Created'); qc.invalidateQueries({ queryKey: ['categories'] }); setModal(false); }, onError: (e: any) => toast.error(e.response?.data?.message || 'Failed') });
  const openEdit = (c: any) => { setEditing(c); setForm({ name: c.name, nameAr: c.nameAr, icon: c.icon || '', description: c.description || '', sortOrder: c.sortOrder.toString(), station: c.station || '' }); setModal(true); };
  const openNew = () => { setEditing(null); setForm({ name: '', nameAr: '', icon: '', description: '', sortOrder: '0', station: '' }); setModal(true); };
  return (
    <div>
      <PageHeader title={t('nav.categories')} actions={<button onClick={openNew} className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-medium">+ Add Category</button>} />
      {isLoading ? <LoadingSpinner /> : (<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">{categories?.map((c: any) => (<div key={c.id} onClick={() => openEdit(c)} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow cursor-pointer text-center"><span className="text-3xl">{c.icon || '\ud83d\udccc'}</span><h3 className="font-semibold text-gray-900 mt-2">{c.name}</h3><p className="text-sm text-gray-500">{c.nameAr}</p></div>))}</div>)}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Category' : 'New Category'}>
        <div className="space-y-4">{[['name', 'Name (EN)'], ['nameAr', 'Name (AR)'], ['icon', 'Icon (emoji)'], ['description', 'Description'], ['sortOrder', 'Sort Order']].map(([key, label]) => (<div key={key}><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label><input value={(form as any)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" /></div>))}
          <div><label className="block text-sm font-medium text-gray-700 mb-1">{t('categories.station')}</label>
            <select value={form.station} onChange={e => setForm(p => ({ ...p, station: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
              <option value="">{t('categories.stationAuto')}</option>
              <option value="HOT KITCHEN">Hot Kitchen</option>
              <option value="PASTRY / BAKERY">Pastry / Bakery</option>
              <option value="BAR / DRINKS">Bar / Drinks</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-5"><button onClick={() => setModal(false)} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium">{t('common.cancel')}</button><button onClick={() => saveMutation.mutate({ ...form, sortOrder: +form.sortOrder })} disabled={saveMutation.isPending || !form.name} className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white py-2.5 rounded-xl text-sm font-medium">{saveMutation.isPending ? 'Saving...' : t('common.save')}</button></div>
      </Modal>
    </div>
  );
}
