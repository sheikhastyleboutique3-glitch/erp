import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import ThemePicker from '../components/ThemePicker';
import { themeFromSettings } from '../lib/theme';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [localSettings, setLocalSettings] = useState<Record<string, string>>({});
  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings').then(r => r.data.data) });
  useEffect(() => { if (settings) { const map: Record<string, string> = {}; settings.forEach((s: any) => { map[s.key] = s.value; }); setLocalSettings(map); } }, [settings]);
  const saveMutation = useMutation({ mutationFn: (data: any) => api.post('/settings/bulk', { settings: data }), onSuccess: () => { toast.success('Settings saved'); qc.invalidateQueries({ queryKey: ['settings'] }); }, onError: (e: any) => toast.error(e.response?.data?.message || 'Failed') });
  const handleSave = () => { const data = Object.entries(localSettings).map(([key, value]) => ({ key, value })); saveMutation.mutate(data); };
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const formData = new FormData(); formData.append('logo', file);
    try { const res = await api.post('/settings/upload-logo', formData, { headers: { 'Content-Type': 'multipart/form-data' } }); setLocalSettings(p => ({ ...p, company_logo: res.data.data.url })); toast.success('Logo uploaded'); } catch { toast.error('Upload failed'); }
  };
  if (isLoading) return <LoadingSpinner />;
  const settingGroups = [
    { group: 'branding', label: '\ud83c\udfa8 ' + t('settings.companyInfo'), keys: ['company_logo'] },
    { group: 'general', label: '\ud83c\udfe2 ' + t('settings.companyInfo'), keys: ['company_name', 'company_name_ar', 'company_tax_id', 'company_address'] },
    { group: 'finance', label: '\ud83d\udcb0 Finance & Currency', keys: ['default_currency', 'supported_currencies'] },
    { group: 'inventory', label: '\ud83d\udce6 Inventory', keys: ['expiry_warning_days', 'low_stock_alert'] },
    { group: 'localization', label: '\ud83c\udf0d Localization', keys: ['default_language'] },
  ];
  return (
    <div className="max-w-2xl">
      <PageHeader title={t('nav.settings')} subtitle="System configuration" />
      <div className="space-y-5">
        <ThemePicker initial={themeFromSettings(localSettings)} />
        {settingGroups.map(group => (<div key={group.group} className="bg-white rounded-2xl border border-gray-100 overflow-hidden"><div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 bg-gray-50"><h3 className="font-semibold text-gray-900">{group.label}</h3></div><div className="p-5 space-y-4">
          {group.keys.map(key => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</label>
              {key === 'company_logo' ? (
                <div className="flex items-center gap-4">
                  {localSettings[key] && <img src={localSettings[key]} alt="Logo" className="h-12 w-auto rounded" />}
                  <input type="file" accept="image/png,image/svg+xml,image/jpeg" onChange={handleLogoUpload} className="text-sm" />
                </div>
              ) : key.includes('color') ? (
                <div className="flex items-center gap-3"><input type="color" value={localSettings[key] || '#2563eb'} onChange={e => setLocalSettings(p => ({ ...p, [key]: e.target.value }))} className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer" /><input value={localSettings[key] || ''} onChange={e => setLocalSettings(p => ({ ...p, [key]: e.target.value }))} className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm" /></div>
              ) : (
                <input value={localSettings[key] || ''} onChange={e => setLocalSettings(p => ({ ...p, [key]: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              )}
            </div>
          ))}
        </div></div>))}
        <button onClick={handleSave} disabled={saveMutation.isPending} className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white font-semibold py-3 rounded-xl">{saveMutation.isPending ? 'Saving...' : t('common.save') + ' Settings'}</button>
      </div>
    </div>
  );
}
