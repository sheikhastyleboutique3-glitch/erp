import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import { printCustomerStatement } from '../lib/thermalPrint';

const blankForm = { name: '', phone: '', email: '', group: '', creditLimit: '0', notes: '' };

export default function CustomersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { activeBranch } = useAuth();
  const { data: settings } = useQuery({ queryKey: ['settings-receipt'], queryFn: () => api.get('/settings').then((r) => r.data.data), staleTime: 300_000 });
  const businessInfo = useMemo(() => {
    const m: Record<string, string> = {};
    (settings || []).forEach((s: any) => { m[s.key] = s.value; });
    return { businessName: m.company_name || undefined, branchName: activeBranch?.name, logoUrl: m.company_logo ? `${window.location.origin}${m.company_logo}` : undefined };
  }, [settings, activeBranch]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(blankForm);

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: () => api.get('/customers', { params: search ? { search } : {} }).then((r) => r.data.data),
  });
  const { data: detail } = useQuery({
    queryKey: ['customer', selectedId],
    queryFn: () => api.get(`/customers/${selectedId}`).then((r) => r.data.data),
    enabled: !!selectedId,
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = { ...form, creditLimit: parseFloat(form.creditLimit) || 0 };
      return editing ? api.patch(`/customers/${editing.id}`, payload) : api.post('/customers', payload);
    },
    onSuccess: () => { toast.success(editing ? t('common.updated') : t('customers.created')); setModal(false); qc.invalidateQueries({ queryKey: ['customers'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const wallet = useMutation({
    mutationFn: (body: { creditDelta?: number; pointsDelta?: number }) => api.post(`/customers/${selectedId}/wallet`, body),
    onSuccess: () => { toast.success(t('customers.walletUpdated')); qc.invalidateQueries({ queryKey: ['customer', selectedId] }); qc.invalidateQueries({ queryKey: ['customers'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const openNew = () => { setEditing(null); setForm(blankForm); setModal(true); };
  const openEdit = (c: any) => { setEditing(c); setForm({ name: c.name, phone: c.phone || '', email: c.email || '', group: c.group || '', creditLimit: String(c.creditLimit ?? 0), notes: c.notes || '' }); setModal(true); };

  const topUp = () => { const v = window.prompt(t('customers.topUpPrompt')); if (!v) return; const a = parseFloat(v); if (a > 0) wallet.mutate({ creditDelta: a }); };
  const grant = () => { const v = window.prompt(t('customers.grantPrompt')); if (!v) return; const p = parseInt(v, 10); if (p) wallet.mutate({ pointsDelta: p }); };
  const printStatement = async () => {
    if (!detail) return;
    try {
      const rows = await api.get('/receivables', { params: { customerId: detail.id } }).then((r) => r.data.data);
      printCustomerStatement(businessInfo, detail, rows || []);
    } catch (e: any) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  return (
    <div>
      <PageHeader title={t('nav.customers')} subtitle={t('customers.subtitle')} />

      <div className="flex flex-wrap gap-2 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('customers.search')} className="flex-1 min-w-[200px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
        <button onClick={openNew} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium">+ {t('customers.new')}</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* List */}
        <div className="lg:col-span-2">
          {isLoading ? <LoadingSpinner /> : (
            <div className="space-y-2">
              {(customers || []).map((c: any) => (
                <button key={c.id} onClick={() => setSelectedId(c.id)} className={`w-full text-start rounded-xl border p-3 transition ${selectedId === c.id ? 'border-primary bg-primary/5' : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'}`}>
                  <div className="flex justify-between items-center">
                    <div className="font-medium text-sm">{c.name}{!c.isActive && <span className="ms-2 text-xs text-gray-400">({t('customers.inactive')})</span>}</div>
                    <div className="text-xs text-gray-500">{t('pos.points')}: {c.loyaltyPoints ?? 0} · {t('pos.credit')}: {Number(c.creditBalance ?? 0).toFixed(2)}</div>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{c.phone || '—'}{c.group ? ` · ${c.group}` : ''}</div>
                </button>
              ))}
              {!customers?.length && <p className="text-sm text-gray-400">{t('customers.empty')}</p>}
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          {detail ? (
            <>
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold">{detail.name}</div>
                  <div className="text-xs text-gray-500">{detail.phone || '—'} · {detail.email || '—'}</div>
                </div>
                <button onClick={() => openEdit(detail)} className="text-xs text-primary">{t('common.edit')}</button>
              </div>
              <button onClick={printStatement} className="mt-2 w-full py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-medium">🖨 {t('customers.statement')}</button>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 p-2 text-center">
                  <div className="text-[10px] uppercase text-gray-400">{t('pos.points')}</div>
                  <div className="text-lg font-bold">{detail.loyaltyPoints ?? 0}</div>
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 p-2 text-center">
                  <div className="text-[10px] uppercase text-gray-400">{t('pos.credit')}</div>
                  <div className="text-lg font-bold">{Number(detail.creditBalance ?? 0).toFixed(2)}</div>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={topUp} className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium">{t('customers.topUp')}</button>
                <button onClick={grant} className="flex-1 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-medium">{t('customers.grantPoints')}</button>
              </div>

              <div className="mt-4">
                <div className="text-xs font-semibold text-gray-500 mb-2">{t('customers.recentOrders')}</div>
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {(detail.orders || []).map((o: any) => (
                    <div key={o.id} className="flex justify-between text-xs border-b border-gray-100 dark:border-gray-800 py-1">
                      <span>{o.orderNo}</span>
                      <span className="text-gray-500">{Number(o.total).toFixed(2)} · {o.status}</span>
                    </div>
                  ))}
                  {!detail.orders?.length && <p className="text-xs text-gray-400">{t('customers.noOrders')}</p>}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400">{t('customers.selectHint')}</p>
          )}
        </div>
      </div>

      {/* Create / edit modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(false)}>
          <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-3">{editing ? t('customers.edit') : t('customers.new')}</h3>
            <div className="space-y-2">
              {([['name', t('customers.name')], ['phone', t('customers.phone')], ['email', t('customers.email')], ['group', t('customers.group')], ['creditLimit', t('customers.creditLimit')], ['notes', t('customers.notes')]] as [string, string][]).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                  <input value={(form as any)[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setModal(false)} className="flex-1 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm">{t('common.cancel')}</button>
              <button onClick={() => save.mutate()} disabled={!form.name || save.isPending} className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50">{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
