import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import toast from 'react-hot-toast';

const DEPARTMENTS = ['KITCHEN', 'BARISTA', 'PASTRY', 'CASHIER', 'CLEANING', 'GENERAL'];
const PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];

export default function NewRequisitionPage() {
  const { t, i18n } = useTranslation();
  const { user, activeBranch } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isRTL = i18n.language === 'ar';
  const cartItems: any[] = location.state?.cartItems || [];
  const [items, setItems] = useState(cartItems.map(i => ({ ...i, notes: '' })));
  const [department, setDepartment] = useState(user?.role || 'GENERAL');
  const [priority, setPriority] = useState('NORMAL');
  const [notes, setNotes] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: () => api.get('/branches').then(r => r.data.data), enabled: ['SUPER_ADMIN', 'BRANCH_MANAGER'].includes(user?.role || '') });
  const [branchId, setBranchId] = useState(activeBranch?.id?.toString() || user?.branchId?.toString() || '');
  const createMutation = useMutation({ mutationFn: (data: any) => api.post('/requisitions', data), onSuccess: (res) => { toast.success('Requisition submitted!'); navigate(`/requisitions/${res.data.data.id}`); }, onError: (err: any) => toast.error(err.response?.data?.message || 'Failed') });
  const updateQty = (idx: number, qty: number) => { if (!Number.isFinite(qty) || qty < 0) return; setItems(prev => prev.map((item, i) => i === idx ? { ...item, qty } : item)); };
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));
  const handleSubmit = () => { if (!items.length) { toast.error('Add at least one item'); return; } if (!branchId) { toast.error('Select a branch'); return; } if (items.some(i => !(i.qty > 0))) { toast.error('Each item needs a quantity greater than 0'); return; } createMutation.mutate({ branchId: +branchId, department, priority, notes: notes || undefined, neededBy: neededBy || undefined, items: items.map(i => ({ productId: i.productId, requestedQty: i.qty, unitId: i.unitId, notes: i.notes || undefined })) }); };
  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader title={t('requisition.new')} backTo="/catalog" />
      <div className="space-y-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">Request Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {['SUPER_ADMIN', 'BRANCH_MANAGER'].includes(user?.role || '') ? (<div><label className="block text-sm font-medium text-gray-700 mb-1">{t('common.branch')}</label><select value={branchId} onChange={e => setBranchId(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"><option value="">Select branch</option>{branches?.map((b: any) => <option key={b.id} value={b.id}>{isRTL ? b.nameAr : b.name}</option>)}</select></div>) : (<div><label className="block text-sm font-medium text-gray-700 mb-1">{t('common.branch')}</label><div className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 text-gray-600">{isRTL ? activeBranch?.nameAr : activeBranch?.name}</div></div>)}
            <div><label className="block text-sm font-medium text-gray-700 mb-1">{t('requisition.department')}</label><select value={department} onChange={e => setDepartment(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm">{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">{t('requisition.priority')}</label><select value={priority} onChange={e => setPriority(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm">{PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">{t('requisition.neededBy')}</label><input type="date" value={neededBy} onChange={e => setNeededBy(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">{t('requisition.notes')}</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none" placeholder="Optional notes..." /></div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4"><h3 className="font-semibold text-gray-900">{t('requisition.items')} ({items.length})</h3><button onClick={() => navigate('/catalog')} className="text-sm text-brand-600 font-medium">+ Add more</button></div>
          {items.length === 0 ? <div className="text-center py-8"><p className="text-gray-400 text-sm">No items. Go to catalog to add products.</p></div> : (
            <div className="space-y-3">{items.map((item, idx) => (<div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl"><div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-900">{isRTL ? item.nameAr : item.name}</p><p className="text-xs text-gray-500">{item.unit}</p></div><div className="flex items-center gap-2"><button onClick={() => updateQty(idx, Math.max(0, Math.round((item.qty - 1) * 100) / 100))} disabled={item.qty <= 0} className="w-7 h-7 rounded-lg bg-white border border-gray-200 text-gray-600 flex items-center justify-center text-sm disabled:opacity-40">-</button><input type="number" value={item.qty} min={0} step="any" onChange={e => { const v = e.target.value; updateQty(idx, v === '' ? 0 : parseFloat(v)); }} className="w-16 text-center border border-gray-200 rounded-lg py-1 text-sm" /><button onClick={() => updateQty(idx, Math.round((item.qty + 1) * 100) / 100)} className="w-7 h-7 rounded-lg bg-white border border-gray-200 text-gray-600 flex items-center justify-center text-sm">+</button><button onClick={() => removeItem(idx)} className="w-7 h-7 rounded-lg bg-red-50 text-red-500 flex items-center justify-center text-sm">×</button></div></div>))}</div>
          )}
        </div>
        <button onClick={handleSubmit} disabled={createMutation.isPending || !items.length} className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white font-semibold py-3.5 rounded-xl text-sm">{createMutation.isPending ? 'Submitting...' : t('requisition.submit')}</button>
      </div>
    </div>
  );
}
