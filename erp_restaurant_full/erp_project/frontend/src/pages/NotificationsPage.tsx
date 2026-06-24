import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

const EVENT_TYPES = [
  { key: 'LOW_STOCK',           label: 'Low Stock Alert',          icon: '📦' },
  { key: 'EXPIRY_WARNING',      label: 'Expiry Warning',           icon: '📅' },
  { key: 'REQUISITION_UPDATE',  label: 'Requisition Status Update',icon: '📋' },
  { key: 'ORDER_UPDATE',        label: 'Purchase Order Update',    icon: '📝' },
  { key: 'WASTAGE_THRESHOLD',   label: 'Wastage Threshold',        icon: '🗑️' },
  { key: 'DELIVERY_CONFIRMED',  label: 'Delivery Confirmed',       icon: '✅' },
];

const WHATSAPP_CONFIG_KEYS = [
  { key: 'whatsapp_api_token',       label: 'Meta API Token',         type: 'password' },
  { key: 'whatsapp_phone_number_id', label: 'Phone Number ID',        type: 'text' },
  { key: 'whatsapp_webhook_secret',  label: 'Webhook Secret',         type: 'password' },
];

const EMAIL_CONFIG_KEYS = [
  { key: 'email_smtp_host',    label: 'SMTP Host',         type: 'text' },
  { key: 'email_smtp_port',    label: 'SMTP Port',         type: 'text' },
  { key: 'email_smtp_user',    label: 'SMTP Username',     type: 'text' },
  { key: 'email_smtp_pass',    label: 'SMTP Password',     type: 'password' },
  { key: 'email_from_address', label: 'From Address',      type: 'email' },
];

/**
 * Phase 6: Notification Hub
 * - SUPER_ADMIN: WhatsApp Business API config + Email SMTP config + test buttons
 * - All users: per-event opt-in matrix for email + WhatsApp channels
 */
export default function NotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [tab, setTab] = useState<'inbox' | 'preferences' | 'config'>('inbox');

  // ---- In-app inbox ----
  const { data: inbox, isLoading: inboxLoading } = useQuery({
    queryKey: ['notif-inbox'],
    queryFn: () => api.get('/notifications/inbox', { params: { take: 100 } }).then(r => r.data.data),
    refetchInterval: 15000,
  });
  const markReadMutation = useMutation({
    mutationFn: (ids: number[]) => api.patch('/notifications/read', { ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notif-inbox'] });
      qc.invalidateQueries({ queryKey: ['notif-unread-count'] });
    },
  });
  const markAllReadMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notif-inbox'] });
      qc.invalidateQueries({ queryKey: ['notif-unread-count'] });
      toast.success('All marked as read');
    },
  });
  const openNotification = (n: any) => {
    if (!n.isRead) markReadMutation.mutate([n.id]);
    if (n.link) navigate(n.link);
  };

  // ---- User preferences ----
  const { data: prefs, isLoading: prefsLoading } = useQuery({
    queryKey: ['notif-prefs'],
    queryFn: () => api.get('/notifications/preferences').then(r => r.data.data),
  });

  // Build a map: { eventType_channel: { enabled, whatsappNumber } }
  const [prefMap, setPrefMap] = useState<Record<string, { enabled: boolean; whatsappNumber?: string }>>({});
  const [waNumber, setWaNumber] = useState('');

  useEffect(() => {
    if (!prefs) return;
    const map: Record<string, { enabled: boolean; whatsappNumber?: string }> = {};
    prefs.forEach((p: any) => {
      map[`${p.eventType}_${p.channel}`] = { enabled: p.enabled, whatsappNumber: p.whatsappNumber };
      if (p.channel === 'whatsapp' && p.whatsappNumber) setWaNumber(p.whatsappNumber);
    });
    setPrefMap(map);
  }, [prefs]);

  const toggle = (eventType: string, channel: string) => {
    const key = `${eventType}_${channel}`;
    setPrefMap(prev => ({ ...prev, [key]: { ...prev[key], enabled: !prev[key]?.enabled } }));
  };

  const savePrefsMutation = useMutation({
    mutationFn: () => {
      const preferences = EVENT_TYPES.flatMap(e =>
        ['email', 'whatsapp'].map(ch => ({
          eventType: e.key,
          channel: ch,
          enabled: prefMap[`${e.key}_${ch}`]?.enabled ?? false,
          whatsappNumber: ch === 'whatsapp' ? waNumber : undefined,
        }))
      );
      return api.patch('/notifications/preferences', { preferences });
    },
    onSuccess: () => { toast.success('Preferences saved'); qc.invalidateQueries({ queryKey: ['notif-prefs'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  // ---- Admin config ----
  const { data: configs, isLoading: configLoading } = useQuery({
    queryKey: ['notif-config'],
    queryFn: () => api.get('/notifications/config').then(r => r.data.data),
    enabled: isSuperAdmin,
  });

  const [configMap, setConfigMap] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!configs) return;
    const map: Record<string, string> = {};
    configs.forEach((c: any) => { map[c.key] = c.value; });
    setConfigMap(map);
  }, [configs]);

  const saveConfigMutation = useMutation({
    mutationFn: (entries: { key: string; value: string }[]) =>
      Promise.all(entries.map(e => api.post('/notifications/config', e))),
    onSuccess: () => { toast.success('Config saved'); qc.invalidateQueries({ queryKey: ['notif-config'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const handleSaveConfig = () => {
    const entries = Object.entries(configMap).map(([key, value]) => ({ key, value }));
    saveConfigMutation.mutate(entries);
  };

  const testWaMutation = useMutation({
    mutationFn: (data: any) => api.post('/notifications/test-whatsapp', data),
    onSuccess: () => toast.success('WhatsApp test sent'),
    onError: (e: any) => toast.error(e.response?.data?.message || 'Test failed'),
  });

  const testEmailMutation = useMutation({
    mutationFn: (data: any) => api.post('/notifications/test-email', data),
    onSuccess: () => toast.success('Test email sent'),
    onError: (e: any) => toast.error(e.response?.data?.message || 'Test failed'),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="💬 Notifications" subtitle="Manage your notification preferences and API configuration" />

      {/* Tab switcher — config tab only for SUPER_ADMIN */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setTab('inbox')}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${
            tab === 'inbox' ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          📥 Inbox
        </button>
        <button
          onClick={() => setTab('preferences')}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${
            tab === 'preferences' ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          🔔 My Preferences
        </button>
        {isSuperAdmin && (
          <button
            onClick={() => setTab('config')}
            className={`px-4 py-2 rounded-xl text-sm font-medium ${
              tab === 'config' ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            ⚙️ API Configuration
          </button>
        )}
      </div>

      {/* ---- Inbox tab ---- */}
      {tab === 'inbox' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-700">
              {isAr ? 'سجل الإشعارات' : 'Notification history'}
            </p>
            <button
              onClick={() => markAllReadMutation.mutate()}
              className="text-xs bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg px-3 py-1.5"
            >
              {isAr ? 'تعليم الكل كمقروء' : 'Mark all as read'}
            </button>
          </div>
          {inboxLoading ? (
            <div className="p-6"><LoadingSpinner /></div>
          ) : !inbox?.length ? (
            <div className="p-10 text-center text-sm text-gray-400">
              {isAr ? 'لا توجد إشعارات بعد' : 'No notifications yet'}
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {inbox.map((n: any) => (
                <li
                  key={n.id}
                  onClick={() => openNotification(n)}
                  className={`px-4 sm:px-6 py-3 flex items-start gap-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                    n.isRead ? 'opacity-70' : 'bg-brand-50/40'
                  }`}
                  style={{ direction: isAr ? 'rtl' : 'ltr' }}
                >
                  {!n.isRead && <span className="mt-1.5 w-2 h-2 rounded-full bg-brand-600 flex-shrink-0" />}
                  {n.isRead && <span className="mt-1.5 w-2 h-2 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {(isAr && n.titleAr) ? n.titleAr : n.title}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {(isAr && n.messageAr) ? n.messageAr : n.message}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {new Date(n.createdAt).toLocaleString(isAr ? 'ar' : 'en')}
                      {n.link && <span className="text-brand-600 ms-2 font-medium">{isAr ? 'عرض ←' : 'View →'}</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ---- Preferences tab ---- */}
      {tab === 'preferences' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {prefsLoading ? <LoadingSpinner /> : (
            <>
              {/* WhatsApp number */}
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                <label className="block text-sm font-semibold text-gray-700 mb-1">📱 Your WhatsApp Number</label>
                <input
                  value={waNumber}
                  onChange={e => setWaNumber(e.target.value)}
                  placeholder="+97450123456"
                  className="w-full max-w-xs border border-gray-200 rounded-xl px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">Used for WhatsApp notifications. Include country code.</p>
              </div>

              {/* Matrix */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-start px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Event</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">📧 Email</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">💬 WhatsApp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {EVENT_TYPES.map(evt => (
                      <tr key={evt.key} className="hover:bg-gray-50">
                        <td className="px-6 py-3">
                          <span className="text-base me-2">{evt.icon}</span>
                          <span className="text-sm text-gray-800">{evt.label}</span>
                        </td>
                        {['email', 'whatsapp'].map(ch => {
                          const key = `${evt.key}_${ch}`;
                          const enabled = prefMap[key]?.enabled ?? false;
                          return (
                            <td key={ch} className="text-center px-4 py-3">
                              <button
                                onClick={() => toggle(evt.key, ch)}
                                className={`w-10 h-6 rounded-full transition-colors relative ${
                                  enabled ? 'bg-brand-600' : 'bg-gray-200'
                                }`}
                              >
                                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                                  enabled ? 'translate-x-4' : 'translate-x-0.5'
                                }`} />
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => savePrefsMutation.mutate()}
                  disabled={savePrefsMutation.isPending}
                  className="bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white px-6 py-2.5 rounded-xl text-sm font-semibold"
                >
                  {savePrefsMutation.isPending ? 'Saving...' : '💾 Save Preferences'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---- Config tab (SUPER_ADMIN) ---- */}
      {tab === 'config' && isSuperAdmin && (
        <div className="space-y-5">
          {/* WhatsApp */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-green-50 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-green-900">💬 Meta WhatsApp Business API</h3>
                <p className="text-xs text-green-600 mt-0.5">Credentials from Meta Business Manager</p>
              </div>
              <button
                onClick={() => testWaMutation.mutate({ phoneNumber: waNumber || '+97450000000', message: 'Test from GWK System ✅' })}
                disabled={testWaMutation.isPending || !configMap.whatsapp_api_token}
                className="text-xs bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-3 py-1.5 rounded-lg"
              >
                {testWaMutation.isPending ? 'Sending...' : '📤 Send Test'}
              </button>
            </div>
            {configLoading ? <LoadingSpinner size="sm" /> : (
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {WHATSAPP_CONFIG_KEYS.map(({ key, label, type }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                    <input
                      type={type}
                      value={configMap[key] || ''}
                      onChange={e => setConfigMap(p => ({ ...p, [key]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                      placeholder={type === 'password' ? '••••••••' : ''}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Email SMTP */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-blue-50 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-blue-900">📧 Email SMTP Configuration</h3>
                <p className="text-xs text-blue-600 mt-0.5">Outbound email via SMTP / Nodemailer</p>
              </div>
              <button
                onClick={() => testEmailMutation.mutate({ to: user?.email, subject: 'GWK Test Email', body: '<h3>Test email from GWK System</h3><p>SMTP is configured correctly.</p>' })}
                disabled={testEmailMutation.isPending || !configMap.email_smtp_host}
                className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-3 py-1.5 rounded-lg"
              >
                {testEmailMutation.isPending ? 'Sending...' : '📤 Send Test'}
              </button>
            </div>
            {configLoading ? <LoadingSpinner size="sm" /> : (
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {EMAIL_CONFIG_KEYS.map(({ key, label, type }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                    <input
                      type={type}
                      value={configMap[key] || ''}
                      onChange={e => setConfigMap(p => ({ ...p, [key]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                      placeholder={type === 'password' ? '••••••••' : ''}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleSaveConfig}
            disabled={saveConfigMutation.isPending}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white font-semibold py-3 rounded-xl"
          >
            {saveConfigMutation.isPending ? 'Saving...' : '💾 Save All Configuration'}
          </button>
        </div>
      )}
    </div>
  );
}
