import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import StatsCard from '../components/StatsCard';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';
import InvoicePreview from '../components/InvoicePreview';
import { playNotificationSound, unlockAudio } from '../lib/sound';

// ---------------------------------------------------------------------------
// Data Management sub-component
// ---------------------------------------------------------------------------
const RECORD_TYPES = [
  { value: 'requisition',    label: 'Requisition',       labelAr: 'طلب',              icon: '📋' },
  { value: 'purchase-order', label: 'Purchase Order',    labelAr: 'أمر شراء',       icon: '📝' },
  { value: 'wastage',        label: 'Wastage Record',    labelAr: 'سجل هدر',        icon: '🗑️' },
  { value: 'alert',          label: 'Alert',             labelAr: 'تنبيه',             icon: '🔔' },
  { value: 'inventory',      label: 'Inventory Record',  labelAr: 'سجل مخزون',     icon: '🏪' },
  { value: 'audit-log',      label: 'Audit Log Entry',   labelAr: 'سجل مراجعة',    icon: '📜' },
];

// ---------------------------------------------------------------------------
// Drivers management sub-component (admin CRUD for dispatch drivers)
// ---------------------------------------------------------------------------
function DriversSection() {
  const blank = { id: undefined as number | undefined, name: '', phone: '', vehicle: '', licenseNo: '', notes: '' };
  const [form, setForm] = useState<typeof blank>(blank);
  const editing = form.id != null;
  const { data: drivers, refetch, isLoading } = useQuery({
    queryKey: ['admin-drivers'],
    queryFn: () => api.get('/drivers').then(r => r.data.data),
  });
  const save = useMutation({
    mutationFn: () => {
      const payload = { name: form.name, phone: form.phone, vehicle: form.vehicle, licenseNo: form.licenseNo, notes: form.notes };
      return editing ? api.patch(`/drivers/${form.id}`, payload) : api.post('/drivers', payload);
    },
    onSuccess: () => { toast.success(editing ? 'Driver updated' : 'Driver added'); setForm(blank); refetch(); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const toggle = useMutation({
    mutationFn: (d: any) => d.isActive ? api.delete(`/drivers/${d.id}`) : api.patch(`/drivers/${d.id}`, { isActive: true }),
    onSuccess: () => refetch(),
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
        <h3 className="font-semibold text-gray-900">🚚 Drivers</h3>
        <p className="text-xs text-gray-500 mt-0.5">Manage delivery drivers available for dispatch</p>
      </div>
      <div className="p-5 space-y-5">
        {/* Add / edit form */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Driver name *" className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          <input value={form.vehicle} onChange={e => setForm(p => ({ ...p, vehicle: e.target.value }))} placeholder="Vehicle (e.g. Van — 12345)" className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          <input value={form.licenseNo} onChange={e => setForm(p => ({ ...p, licenseNo: e.target.value }))} placeholder="License No." className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" className="border border-gray-200 rounded-xl px-3 py-2 text-sm sm:col-span-2" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => { if (!form.name.trim()) { toast.error('Name is required'); return; } save.mutate(); }} disabled={save.isPending} className="bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white font-medium px-4 py-2 rounded-xl text-sm">
            {save.isPending ? 'Saving…' : editing ? 'Update Driver' : '+ Add Driver'}
          </button>
          {editing && <button onClick={() => setForm(blank)} className="border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm">Cancel</button>}
        </div>

        {/* Drivers list */}
        {isLoading ? <LoadingSpinner /> : (
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-start px-3 py-2">Name</th>
                  <th className="text-start px-3 py-2">Phone</th>
                  <th className="text-start px-3 py-2">Vehicle</th>
                  <th className="text-center px-3 py-2">Status</th>
                  <th className="text-end px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {drivers?.map((d: any) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-900 font-medium">{d.name}</td>
                    <td className="px-3 py-2 text-gray-600">{d.phone || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{d.vehicle || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${d.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{d.isActive ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-3 py-2 text-end whitespace-nowrap">
                      <button onClick={() => setForm({ id: d.id, name: d.name, phone: d.phone || '', vehicle: d.vehicle || '', licenseNo: d.licenseNo || '', notes: d.notes || '' })} className="text-xs text-brand-600 hover:underline me-3">Edit</button>
                      <button onClick={() => toggle.mutate(d)} className={`text-xs hover:underline ${d.isActive ? 'text-red-500' : 'text-green-600'}`}>{d.isActive ? 'Deactivate' : 'Activate'}</button>
                    </td>
                  </tr>
                ))}
                {!drivers?.length && <tr><td colSpan={5} className="text-center text-gray-400 py-6">No drivers yet. Add one above.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DataManagementSection({ onDeleted }: { onDeleted: () => void }) {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [recordType, setRecordType] = useState('requisition');
  const [recordId, setRecordId] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selectedType = RECORD_TYPES.find(t => t.value === recordType)!;

  const handleDelete = async () => {
    if (!recordId || isNaN(+recordId) || +recordId <= 0) {
      toast.error('Enter a valid numeric ID');
      return;
    }
    setDeleting(true);
    try {
      const res = await api.delete(`/admin/records/${recordType}/${recordId}`);
      toast.success(res.data.data?.message || 'Record deleted');
      setRecordId('');
      setConfirmOpen(false);
      onDeleted();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-orange-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-orange-200 bg-orange-50">
        <h3 className="font-semibold text-orange-900">🛠️ Data Management</h3>
        <p className="text-xs text-orange-600 mt-0.5">Delete individual records by type and ID. This action is permanent and cannot be undone.</p>
      </div>
      <div className="p-5 space-y-4">
        {/* Type selector */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">Record Type</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {RECORD_TYPES.map(rt => (
              <button
                key={rt.value}
                onClick={() => { setRecordType(rt.value); setRecordId(''); setConfirmOpen(false); }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  recordType === rt.value
                    ? 'border-orange-400 bg-orange-50 text-orange-800'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span>{rt.icon}</span>
                <span className="truncate">{isRTL ? rt.labelAr : rt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ID input */}
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {selectedType.icon} {isRTL ? selectedType.labelAr : selectedType.label} ID
            </label>
            <input
              type="number"
              min={1}
              value={recordId}
              onChange={e => { setRecordId(e.target.value); setConfirmOpen(false); }}
              placeholder={`Enter ${isRTL ? selectedType.labelAr : selectedType.label} ID...`}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <button
            onClick={() => {
              if (!recordId || isNaN(+recordId) || +recordId <= 0) { toast.error('Enter a valid numeric ID'); return; }
              setConfirmOpen(true);
            }}
            className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap"
          >
            🗑️ Delete Record
          </button>
        </div>

        {/* Confirmation */}
        {confirmOpen && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-red-800">
              ⚠️ Confirm permanent deletion
            </p>
            <p className="text-sm text-red-700">
              You are about to permanently delete <strong>{isRTL ? selectedType.labelAr : selectedType.label} #{recordId}</strong>.
              This cannot be undone. All related child records will also be deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-xl text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white py-2 rounded-xl text-sm font-bold"
              >
                {deleting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Deleting...
                  </span>
                ) : `💥 Yes, Delete ${isRTL ? selectedType.labelAr : selectedType.label} #${recordId}`}
              </button>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400">
          ℹ️ Tip: Find record IDs in the respective pages (Requisitions, Purchase Orders, etc.) or in the Audit Log.
        </p>
      </div>
    </div>
  );
}

const REQUIRED_PHRASE = 'PURGE-ALL-OPERATIONAL-DATA-TO-ZERO';

const INVOICE_DEFAULTS: Record<string, string> = {
  invoice_header_text: '',
  invoice_footer_text: '',
  invoice_terms: '',
  invoice_accent_color: '#1e40af',
  invoice_show_logo: 'true',
  invoice_tax_rate: '0',
  invoice_currency: 'QAR',
  invoice_sig_prepared: 'Prepared By',
  invoice_sig_approved: 'Approved By',
  invoice_sig_ack: 'Supplier Acknowledgment',
  invoice_paper_size: 'A4',
  invoice_language: 'en',
};

const SOUND_DEFAULTS: Record<string, string> = {
  sound_enabled: 'true',
  sound_volume: '70',
  sound_alerts_enabled: 'true',
  sound_requisitions_enabled: 'true',
  sound_orders_enabled: 'true',
  sound_url_alerts: '',
  sound_url_requisitions: '',
  sound_url_orders: '',
};

// The three audible notification channels surfaced in the admin panel.
const SOUND_CHANNELS: { key: 'alerts' | 'requisitions' | 'orders'; icon: string }[] = [
  { key: 'alerts', icon: '🔔' },
  { key: 'requisitions', icon: '📋' },
  { key: 'orders', icon: '📝' },
];

type ResetStep = 'choose' | 'confirm' | 'done';

export default function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';

  // ---- Invoice customization state ----
  const [invoice, setInvoice] = useState<Record<string, string>>(INVOICE_DEFAULTS);
  const setInv = (key: string, value: string) => setInvoice(p => ({ ...p, [key]: value }));

  // ---- Notification sound state ----
  const [sound, setSound] = useState<Record<string, string>>(SOUND_DEFAULTS);
  const setSnd = (key: string, value: string) => setSound(p => ({ ...p, [key]: value }));
  const [uploadingSound, setUploadingSound] = useState<string | null>(null);

  // ---- Reset state ----
  const [showReset, setShowReset]     = useState(false);
  const [resetStep, setResetStep]     = useState<ResetStep>('choose');
  const [keepMaster, setKeepMaster]   = useState(true);
  const [confirmPhrase, setConfirmPhrase] = useState('');

  // ---- Queries ----
  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/admin/stats').then(r => r.data.data),
    enabled: user?.role === 'SUPER_ADMIN',
    staleTime: 0,
    refetchInterval: 30000,
  });

  const { data: invoiceSettings } = useQuery({
    queryKey: ['settings', 'invoice'],
    queryFn: () => api.get('/settings', { params: { group: 'invoice' } }).then(r => r.data.data),
    enabled: user?.role === 'SUPER_ADMIN',
  });

  useEffect(() => {
    if (invoiceSettings) {
      const map: Record<string, string> = { ...INVOICE_DEFAULTS };
      invoiceSettings.forEach((s: any) => { map[s.key] = s.value; });
      setInvoice(map);
    }
  }, [invoiceSettings]);

  const invoiceMutation = useMutation({
    mutationFn: () => api.post('/settings/bulk', {
      settings: Object.entries(invoice).map(([key, value]) => ({ key, value: String(value), group: 'invoice' })),
    }),
    onSuccess: () => toast.success(t('admin.saveInvoiceSettings')),
    onError: (e: any) => toast.error(e.response?.data?.message || 'Save failed'),
  });

  // ---- Notification sound: load, save, upload, test ----
  const { data: soundSettings } = useQuery({
    queryKey: ['settings', 'sound'],
    queryFn: () => api.get('/settings', { params: { group: 'sound' } }).then(r => r.data.data),
    enabled: user?.role === 'SUPER_ADMIN',
  });

  useEffect(() => {
    if (soundSettings) {
      const map: Record<string, string> = { ...SOUND_DEFAULTS };
      soundSettings.forEach((s: any) => { map[s.key] = s.value; });
      setSound(map);
    }
  }, [soundSettings]);

  const soundMutation = useMutation({
    mutationFn: () => api.post('/settings/bulk', {
      settings: Object.entries(sound).map(([key, value]) => ({ key, value: String(value), group: 'sound' })),
    }),
    onSuccess: () => toast.success(t('sound.saved')),
    onError: (e: any) => toast.error(e.response?.data?.message || 'Save failed'),
  });

  const uploadSound = async (channel: string, file: File) => {
    const fd = new FormData();
    fd.append('sound', file);
    fd.append('key', `sound_url_${channel}`);
    setUploadingSound(channel);
    try {
      const res = await api.post('/settings/upload-sound', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSnd(`sound_url_${channel}`, res.data.data.url);
      toast.success(t('sound.uploaded'));
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Upload failed');
    } finally {
      setUploadingSound(null);
    }
  };

  const testSound = (channel: string) => {
    unlockAudio();
    playNotificationSound({
      channel,
      url: sound[`sound_url_${channel}`] || undefined,
      volume: (parseInt(sound.sound_volume, 10) || 0) / 100,
    });
  };

  const resetMutation = useMutation({
    mutationFn: (data: any) => api.post('/admin/reset', data),
    onSuccess: res => {
      toast.success(res.data.data?.message || 'Reset complete ✅');
      setResetStep('done');
      setConfirmPhrase('');
      refetch();
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || 'Reset failed');
    },
  });

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') navigate('/', { replace: true });
  }, [user, navigate]);

  if (!user || user.role !== 'SUPER_ADMIN') return null;

  const handleExecuteReset = () => {
    if (confirmPhrase !== REQUIRED_PHRASE) {
      toast.error(`Type exactly: ${REQUIRED_PHRASE}`);
      return;
    }
    resetMutation.mutate({ confirmPhrase, keepMasterData: keepMaster });
  };

  const handleOpenReset = () => {
    setShowReset(true);
    setResetStep('choose');
    setConfirmPhrase('');
  };

  const handleCloseReset = () => {
    setShowReset(false);
    setResetStep('choose');
    setConfirmPhrase('');
  };

  const statCards = stats ? [
    { title: t('admin.stats.users'),        value: stats.counts.users,          icon: '👥', color: 'blue'   as const },
    { title: t('admin.stats.branches'),     value: stats.counts.branches,       icon: '🏢', color: 'indigo' as const },
    { title: t('admin.stats.products'),     value: stats.counts.products,       icon: '📦', color: 'purple' as const },
    { title: t('admin.stats.requisitions'), value: stats.counts.requisitions,   icon: '📋', color: 'yellow' as const },
    { title: t('admin.stats.inventory'),    value: stats.counts.inventory,      icon: '🏪', color: 'green'  as const },
    { title: t('admin.stats.wastage'),      value: stats.counts.wastage,        icon: '🗑️', color: 'red'    as const },
    { title: t('admin.stats.alerts'),       value: stats.counts.alerts,         icon: '🔔', color: 'orange' as const },
    { title: t('admin.stats.pos'),          value: stats.counts.purchaseOrders, icon: '📝', color: 'blue'   as const },
  ] : [];

  return (
    <div className="space-y-6">
      <PageHeader title={`🛡️ ${t('admin.title')}`} subtitle={t('admin.subtitle')} />

      {/* System Stats */}
      {isLoading ? <LoadingSpinner /> : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {statCards.map(s => <StatsCard key={s.title} {...s} />)}
        </div>
      )}

      {/* Invoice & Bill Customization */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="font-semibold text-gray-900">🧾 {t('admin.invoiceCustomization')}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{t('admin.invoiceSubtitle')}</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('admin.headerText')}</label>
              <input value={invoice.invoice_header_text} onChange={e => setInv('invoice_header_text', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('admin.footerText')}</label>
              <input value={invoice.invoice_footer_text} onChange={e => setInv('invoice_footer_text', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('admin.termsConditions')}</label>
              <textarea value={invoice.invoice_terms} onChange={e => setInv('invoice_terms', e.target.value)} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('admin.accentColor')}</label>
              <div className="flex items-center gap-2">
                <input type="color" value={invoice.invoice_accent_color} onChange={e => setInv('invoice_accent_color', e.target.value)} className="w-12 h-10 border border-gray-200 rounded-xl px-1 py-1 cursor-pointer" />
                <span className="text-sm text-gray-600 font-mono">{invoice.invoice_accent_color}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('admin.defaultCurrency')}</label>
              <select value={invoice.invoice_currency} onChange={e => setInv('invoice_currency', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                {['QAR', 'USD', 'EUR', 'AED', 'SAR', 'GBP'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('admin.taxVatRate')}</label>
              <input type="number" min={0} max={100} step={0.5} value={invoice.invoice_tax_rate} onChange={e => setInv('invoice_tax_rate', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('admin.paperSize')}</label>
              <select value={invoice.invoice_paper_size} onChange={e => setInv('invoice_paper_size', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                <option value="A4">A4</option>
                <option value="LETTER">Letter</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('admin.documentLanguage')}</label>
              <select value={invoice.invoice_language} onChange={e => setInv('invoice_language', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                <option value="en">English</option>
                <option value="ar">عربي (Arabic)</option>
                <option value="bilingual">Bilingual (EN + AR)</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <input id="showLogo" type="checkbox" checked={invoice.invoice_show_logo === 'true'} onChange={e => setInv('invoice_show_logo', e.target.checked ? 'true' : 'false')} className="rounded w-4 h-4" />
              <label htmlFor="showLogo" className="text-sm text-gray-700">{t('admin.showLogo')}</label>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('admin.signatureLabels')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Signature 1</label>
                <input value={invoice.invoice_sig_prepared} onChange={e => setInv('invoice_sig_prepared', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Signature 2</label>
                <input value={invoice.invoice_sig_approved} onChange={e => setInv('invoice_sig_approved', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Signature 3</label>
                <input value={invoice.invoice_sig_ack} onChange={e => setInv('invoice_sig_ack', e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
            </div>
          </div>
          <div className="mt-5">
            <InvoicePreview settings={invoice} />
          </div>
          <button
            onClick={() => invoiceMutation.mutate()}
            disabled={invoiceMutation.isPending}
            className="mt-4 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white font-semibold px-5 py-2.5 rounded-xl text-sm"
          >
            {invoiceMutation.isPending ? t('common.saving') : t('admin.saveInvoiceSettings')}
          </button>
        </div>
      </div>

      {/* ================================================================
          NOTIFICATION SOUNDS — real-time audible alerts/orders/requisitions
          ================================================================ */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="font-semibold text-gray-900">🔔 {t('sound.title')}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{t('sound.subtitle')}</p>
        </div>
        <div className="p-5 space-y-5">
          {/* Master toggle + volume */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 cursor-pointer">
              <input
                type="checkbox"
                checked={sound.sound_enabled === 'true'}
                onChange={e => setSnd('sound_enabled', e.target.checked ? 'true' : 'false')}
                className="rounded w-4 h-4"
              />
              <span className="text-sm font-medium text-gray-800">{t('sound.masterEnable')}</span>
            </label>
            <div className="p-3 rounded-xl border border-gray-200">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t('sound.volume')}: <span className="font-mono">{sound.sound_volume}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={sound.sound_volume}
                onChange={e => setSnd('sound_volume', e.target.value)}
                className="w-full"
              />
            </div>
          </div>

          {/* Per-channel config */}
          <div className="space-y-3">
            {SOUND_CHANNELS.map(({ key, icon }) => {
              const enabledKey = `sound_${key}_enabled`;
              const urlKey = `sound_url_${key}`;
              const hasCustom = !!sound[urlKey];
              return (
                <div key={key} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center gap-3 justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sound[enabledKey] === 'true'}
                        onChange={e => setSnd(enabledKey, e.target.checked ? 'true' : 'false')}
                        className="rounded w-4 h-4"
                      />
                      <span className="text-sm font-semibold text-gray-800">{icon} {t(`sound.channel.${key}`)}</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">
                        {hasCustom ? t('sound.customSound') : t('sound.defaultSound')}
                      </span>
                      <button
                        type="button"
                        onClick={() => testSound(key)}
                        className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg px-3 py-1.5 font-medium"
                      >
                        ▶ {t('sound.test')}
                      </button>
                      <label className="text-xs bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-lg px-3 py-1.5 font-medium cursor-pointer">
                        {uploadingSound === key ? t('common.saving') : `⬆ ${t('sound.upload')}`}
                        <input
                          type="file"
                          accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm"
                          className="hidden"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) uploadSound(key, f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      {hasCustom && (
                        <button
                          type="button"
                          onClick={() => setSnd(urlKey, '')}
                          className="text-xs text-red-600 hover:text-red-700 rounded-lg px-2 py-1.5 font-medium"
                        >
                          {t('sound.reset')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-gray-400">{t('sound.hint')}</p>

          <button
            onClick={() => soundMutation.mutate()}
            disabled={soundMutation.isPending}
            className="bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white font-semibold px-5 py-2.5 rounded-xl text-sm"
          >
            {soundMutation.isPending ? t('common.saving') : t('sound.save')}
          </button>
        </div>
      </div>

      {/* ================================================================
          DRIVERS — manage dispatch drivers
          ================================================================ */}
      <DriversSection />

      {/* ================================================================
          DATA MANAGEMENT — delete individual records
          ================================================================ */}
      <DataManagementSection onDeleted={refetch} />

      {/* ================================================================
          SYSTEM RESET — rebuilt from scratch
          No password required. 3-step flow: choose → confirm → done.
          ================================================================ */}
      <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-red-50 border-b border-red-200">
          <div>
            <h3 className="font-semibold text-red-900 flex items-center gap-2">
              ⚠️ {t('admin.systemReset')}
            </h3>
            <p className="text-xs text-red-600 mt-0.5">{t('admin.resetWarning')}</p>
          </div>
          {!showReset ? (
            <button
              onClick={handleOpenReset}
              className="text-sm bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              {t('admin.showReset')}
            </button>
          ) : (
            <button
              onClick={handleCloseReset}
              className="text-sm text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg"
            >
              ✕ {t('admin.hideReset')}
            </button>
          )}
        </div>

        {showReset && (
          <div className="p-5">

            {/* Step indicators */}
            <div className="flex items-center gap-2 mb-6">
              {(['choose', 'confirm', 'done'] as ResetStep[]).map((step, idx) => (
                <div key={step} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    resetStep === step
                      ? 'bg-red-600 text-white'
                      : (idx < (['choose','confirm','done'] as ResetStep[]).indexOf(resetStep))
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 text-gray-500'
                  }`}>
                    {idx < (['choose','confirm','done'] as ResetStep[]).indexOf(resetStep) ? '✓' : idx + 1}
                  </div>
                  <span className={`text-xs font-medium ${
                    resetStep === step ? 'text-red-700' : 'text-gray-400'
                  }`}>
                    {step === 'choose' ? 'Choose Type' : step === 'confirm' ? 'Confirm' : 'Done'}
                  </span>
                  {idx < 2 && <div className="w-8 h-px bg-gray-200" />}
                </div>
              ))}
            </div>

            {/* STEP 1: Choose reset type */}
            {resetStep === 'choose' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 mb-3">Select the type of reset you want to perform:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Soft Reset */}
                  <button
                    onClick={() => { setKeepMaster(true); setResetStep('confirm'); }}
                    className="text-start p-5 rounded-xl border-2 border-yellow-300 bg-yellow-50 hover:bg-yellow-100 hover:border-yellow-400 transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">🧹</span>
                      <span className="font-bold text-gray-900">{t('admin.softReset')}</span>
                    </div>
                    <p className="text-xs text-gray-600 mb-3">{t('admin.softResetDesc')}</p>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-red-600">🗑️ Will delete:</p>
                      <ul className="text-xs text-red-700 space-y-0.5 ms-3">
                        <li>• All requisitions &amp; status history</li>
                        <li>• All purchase orders</li>
                        <li>• All inventory records</li>
                        <li>• All wastage records</li>
                        <li>• All alerts &amp; audit logs</li>
                        <li>• All notifications &amp; price history</li>
                      </ul>
                      <p className="text-xs font-semibold text-green-600 mt-2">✅ Will keep:</p>
                      <ul className="text-xs text-green-700 space-y-0.5 ms-3">
                        <li>• All users &amp; roles</li>
                        <li>• All branches</li>
                        <li>• All products &amp; categories</li>
                        <li>• All suppliers &amp; units</li>
                        <li>• All settings</li>
                      </ul>
                    </div>
                    <div className="mt-3 text-xs font-semibold text-yellow-700 group-hover:text-yellow-800">
                      Select Soft Reset →
                    </div>
                  </button>

                  {/* Full Wipe */}
                  <button
                    onClick={() => { setKeepMaster(false); setResetStep('confirm'); }}
                    className="text-start p-5 rounded-xl border-2 border-red-300 bg-red-50 hover:bg-red-100 hover:border-red-400 transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">💣</span>
                      <span className="font-bold text-gray-900">{t('admin.fullWipe')}</span>
                    </div>
                    <p className="text-xs text-gray-600 mb-3">{t('admin.fullWipeDesc')}</p>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-red-600">🗑️ Will delete EVERYTHING including:</p>
                      <ul className="text-xs text-red-700 space-y-0.5 ms-3">
                        <li>• All of the above (Soft Reset)</li>
                        <li>• All products &amp; categories</li>
                        <li>• All suppliers &amp; units</li>
                        <li>• All non-admin users</li>
                      </ul>
                      <p className="text-xs font-semibold text-green-600 mt-2">✅ Will keep:</p>
                      <ul className="text-xs text-green-700 space-y-0.5 ms-3">
                        <li>• Super Admin accounts only</li>
                        <li>• Branch records</li>
                        <li>• System settings</li>
                      </ul>
                    </div>
                    <div className="mt-3 text-xs font-semibold text-red-700 group-hover:text-red-800">
                      Select Full Wipe →
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Confirm */}
            {resetStep === 'confirm' && (
              <div className="space-y-5">
                {/* Summary of what was chosen */}
                <div className={`p-4 rounded-xl border-2 ${
                  keepMaster ? 'border-yellow-300 bg-yellow-50' : 'border-red-300 bg-red-50'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{keepMaster ? '🧹' : '💣'}</span>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {keepMaster ? t('admin.softReset') : t('admin.fullWipe')}
                      </p>
                      <p className="text-xs text-gray-500">
                        {keepMaster ? t('admin.softResetDesc') : t('admin.fullWipeDesc')}
                      </p>
                    </div>
                    <button
                      onClick={() => setResetStep('choose')}
                      className="ms-auto text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                      Change
                    </button>
                  </div>
                </div>

                {/* Confirmation phrase */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-gray-700">
                    {t('admin.confirmPhrase')}
                  </p>
                  <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                    <code className="text-sm text-red-700 font-mono select-all break-all">
                      {REQUIRED_PHRASE}
                    </code>
                  </div>
                  <input
                    value={confirmPhrase}
                    onChange={e => setConfirmPhrase(e.target.value)}
                    placeholder="Type the phrase above exactly..."
                    className={`w-full border rounded-xl px-3 py-2.5 text-sm font-mono transition-colors ${
                      confirmPhrase === REQUIRED_PHRASE
                        ? 'border-green-400 bg-green-50 text-green-800'
                        : confirmPhrase.length > 0
                          ? 'border-red-300 bg-red-50'
                          : 'border-gray-200'
                    }`}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {confirmPhrase === REQUIRED_PHRASE && (
                    <p className="text-xs text-green-600 font-medium">✅ Phrase matches — ready to execute</p>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setResetStep('choose')}
                    className="flex-1 border border-gray-200 text-gray-700 py-3 rounded-xl text-sm font-medium hover:bg-gray-50"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handleExecuteReset}
                    disabled={resetMutation.isPending || confirmPhrase !== REQUIRED_PHRASE}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      keepMaster
                        ? 'bg-yellow-600 hover:bg-yellow-700'
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                  >
                    {resetMutation.isPending ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        {t('admin.executing')}
                      </span>
                    ) : (
                      `💥 ${t('admin.executeReset')} — ${keepMaster ? t('admin.softReset') : t('admin.fullWipe')}`
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Done */}
            {resetStep === 'done' && (
              <div className="text-center py-8 space-y-4">
                <div className="text-5xl">✅</div>
                <p className="text-lg font-bold text-gray-900">Reset Complete</p>
                <p className="text-sm text-gray-500">
                  {keepMaster
                    ? 'Transactional data cleared. Master data preserved. All IDs reset to 1.'
                    : 'Full wipe complete. Super Admin accounts retained. All IDs reset to 1.'}
                </p>
                <button
                  onClick={handleCloseReset}
                  className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-2.5 rounded-xl text-sm font-semibold"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Demo Credentials */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="font-semibold text-gray-900">🔑 {t('admin.demoCredentials')}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {t('admin.allPasswords')} <code className="bg-gray-200 px-1.5 py-0.5 rounded text-xs">Admin@1234</code>
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-start px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Email</th>
                <th className="text-start px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Role</th>
                <th className="text-start px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Branch</th>
                <th className="text-start px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Language</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {[
                { email: 'admin@gwk.com',       role: 'SUPER_ADMIN',    branch: 'All Branches',     lang: 'EN' },
                { email: 'manager.d@gwk.com',   role: 'BRANCH_MANAGER', branch: 'Doha (West Bay)',  lang: 'AR' },
                { email: 'manager.w@gwk.com',   role: 'BRANCH_MANAGER', branch: 'Al Wakra',         lang: 'AR' },
                { email: 'procurement@gwk.com', role: 'PROCUREMENT',    branch: 'Central Warehouse',lang: 'EN' },
                { email: 'warehouse@gwk.com',   role: 'WAREHOUSE',      branch: 'Central Warehouse',lang: 'AR' },
                { email: 'kitchen@gwk.com',     role: 'KITCHEN',        branch: 'Doha',             lang: 'AR' },
                { email: 'barista@gwk.com',     role: 'BARISTA',        branch: 'Doha',             lang: 'EN' },
                { email: 'pastry@gwk.com',      role: 'PASTRY',         branch: 'Doha',             lang: 'AR' },
                { email: 'cashier@gwk.com',     role: 'CASHIER',        branch: 'Doha',             lang: 'EN' },
                { email: 'cleaner@gwk.com',     role: 'CLEANER',        branch: 'Doha',             lang: 'AR' },
                { email: 'kitchen.w@gwk.com',   role: 'KITCHEN',        branch: 'Al Wakra',         lang: 'AR' },
              ].map(row => (
                <tr key={row.email} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <code className="text-xs text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded">{row.email}</code>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                      {t(`roles.${row.role}`)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">{row.branch}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      row.lang === 'AR' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                    }`}>{row.lang}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
