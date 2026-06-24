import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

const ROLES = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'PROCUREMENT', 'WAREHOUSE', 'KITCHEN', 'BARISTA', 'PASTRY', 'CASHIER', 'WAITER', 'CLEANER'];
const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN:    'bg-red-100 text-red-700',
  BRANCH_MANAGER: 'bg-purple-100 text-purple-700',
  PROCUREMENT:    'bg-blue-100 text-blue-700',
  WAREHOUSE:      'bg-indigo-100 text-indigo-700',
  KITCHEN:        'bg-orange-100 text-orange-700',
  BARISTA:        'bg-yellow-100 text-yellow-700',
  PASTRY:         'bg-pink-100 text-pink-700',
  CASHIER:        'bg-green-100 text-green-700',
  WAITER:         'bg-indigo-100 text-indigo-700',
  CLEANER:        'bg-teal-100 text-teal-700',
};

export default function UsersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    email: '', password: '', firstName: '', lastName: '',
    firstNameAr: '', lastNameAr: '', role: 'CASHIER',
    branchId: '', language: 'en', assignedBranchIds: [] as number[],
  });

  const { data: users, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users').then(r => r.data.data) });
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: () => api.get('/branches').then(r => r.data.data) });

  const saveMutation = useMutation({
    mutationFn: (data: any) => editing
      ? api.patch(`/users/${editing.id}`, data)
      : api.post('/users', data),
    onSuccess: () => { toast.success(editing ? 'Updated' : 'Created'); qc.invalidateQueries({ queryKey: ['users'] }); setModal(false); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const openEdit = (u: any) => {
    setEditing(u);
    setForm({
      email: u.email, password: '',
      firstName: u.firstName, lastName: u.lastName,
      firstNameAr: u.firstNameAr || '', lastNameAr: u.lastNameAr || '',
      role: u.role, branchId: u.branchId?.toString() || '',
      language: u.language,
      assignedBranchIds: u.assignedBranches?.map((b: any) => b.id) || [],
    });
    setModal(true);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ email: '', password: '', firstName: '', lastName: '', firstNameAr: '', lastNameAr: '', role: 'CASHIER', branchId: '', language: 'en', assignedBranchIds: [] });
    setModal(true);
  };

  const toggleBranch = (branchId: number) => {
    setForm(p => ({
      ...p,
      assignedBranchIds: p.assignedBranchIds.includes(branchId)
        ? p.assignedBranchIds.filter(id => id !== branchId)
        : [...p.assignedBranchIds, branchId],
    }));
  };

  const handleSave = () => {
    const d: any = { ...form, branchId: form.branchId ? +form.branchId : undefined };
    if (!d.password) delete d.password;
    saveMutation.mutate(d);
  };

  return (
    <div>
      <PageHeader
        title={t('nav.users')}
        actions={
          <button onClick={openNew} className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
            + Add User
          </button>
        }
      />

      {isLoading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Name</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Role</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Branches</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users?.map((u: any) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-bold">
                          {u.firstName[0]}{u.lastName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{u.firstName} {u.lastName}</p>
                          {u.firstNameAr && <p className="text-xs text-gray-400">{u.firstNameAr} {u.lastNameAr}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-700'}`}>
                        {t(`roles.${u.role}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.assignedBranches?.map((b: any) => (
                          <span key={b.id} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                            {b.name}{b.isPrimary && ' ★'}
                          </span>
                        ))}
                        {!u.assignedBranches?.length && (
                          <span className="text-xs text-gray-400">{u.branch?.name || '-'}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEdit(u)} className="text-xs text-brand-600 font-medium">{t('common.edit')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit User' : 'New User'} size="xl">
        <div className="grid grid-cols-2 gap-4">
          {[['firstName','First Name (EN)'],['lastName','Last Name (EN)'],['firstNameAr','First Name (AR)'],['lastNameAr','Last Name (AR)'],['email','Email']].map(([key, label]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input value={(form as any)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{editing ? 'New Password (blank = keep)' : 'Password'}</label>
            <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
              {ROLES.map(r => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Primary Branch</label>
            <select value={form.branchId} onChange={e => setForm(p => ({ ...p, branchId: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
              <option value="">No branch</option>
              {branches?.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
            <select value={form.language} onChange={e => setForm(p => ({ ...p, language: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
              <option value="en">English</option>
              <option value="ar">عربي</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">🏢 Assigned Branches (multi-select)</label>
            <div className="flex flex-wrap gap-2">
              {branches?.map((b: any) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggleBranch(b.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    form.assignedBranchIds.includes(b.id)
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={() => setModal(false)} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium">{t('common.cancel')}</button>
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending || !form.firstName}
            className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white py-2.5 rounded-xl text-sm font-medium"
          >
            {saveMutation.isPending ? 'Saving...' : t('common.save')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
