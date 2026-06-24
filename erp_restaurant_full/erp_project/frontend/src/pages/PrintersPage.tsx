import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';

interface PrinterForm {
  name: string;
  connection: string;
  ipAddress?: string;
  port?: number;
  usbPort?: string;
  widthMm: number;
}

const EMPTY: PrinterForm = { name: '', connection: 'IP', ipAddress: '', port: 9100, usbPort: '', widthMm: 80 };

export default function PrintersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<PrinterForm>(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);

  const { data: printers, isLoading } = useQuery({
    queryKey: ['printers'],
    queryFn: () => api.get('/printers').then((r) => r.data.data),
  });

  const save = useMutation({
    mutationFn: () => (editId ? api.patch(`/printers/${editId}`, form) : api.post('/printers', form)),
    onSuccess: () => {
      toast.success(t('common.saved'));
      qc.invalidateQueries({ queryKey: ['printers'] });
      setForm(EMPTY);
      setEditId(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/printers/${id}`),
    onSuccess: () => {
      toast.success(t('common.deleted'));
      qc.invalidateQueries({ queryKey: ['printers'] });
    },
  });

  const startEdit = (p: any) => {
    setEditId(p.id);
    setForm({ name: p.name, connection: p.connection, ipAddress: p.ipAddress ?? '', port: p.port ?? 9100, usbPort: p.usbPort ?? '', widthMm: p.widthMm });
  };

  return (
    <div>
      <PageHeader title={t('nav.printers')} subtitle={t('printers.subtitle')} />

      <div className="grid md:grid-cols-3 gap-5">
        <div className="md:col-span-2">
          {isLoading ? <LoadingSpinner /> : (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase text-gray-400 border-b border-gray-100 dark:border-gray-800">
                    <th className="text-start p-3">{t('printers.name')}</th>
                    <th className="text-start p-3">{t('printers.connection')}</th>
                    <th className="text-start p-3">{t('printers.address')}</th>
                    <th className="text-end p-3">{t('printers.width')}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {(printers || []).map((p: any) => (
                    <tr key={p.id} className={`border-b border-gray-50 dark:border-gray-800/50 ${!p.isActive ? 'opacity-40' : ''}`}>
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3 text-gray-500">{p.connection}</td>
                      <td className="p-3 text-gray-500">{p.connection === 'USB' ? p.usbPort : `${p.ipAddress ?? '—'}:${p.port ?? ''}`}</td>
                      <td className="p-3 text-end">{p.widthMm}mm</td>
                      <td className="p-3 text-end whitespace-nowrap">
                        <button onClick={() => startEdit(p)} className="text-xs text-primary mr-3">{t('common.edit')}</button>
                        <button onClick={() => remove.mutate(p.id)} className="text-xs text-red-600">{t('common.delete')}</button>
                      </td>
                    </tr>
                  ))}
                  {!printers?.length && (
                    <tr><td colSpan={5} className="p-6 text-center text-gray-400">{t('printers.empty')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-gray-400 mt-3">{t('printers.note')}</p>
        </div>

        {/* Create / edit */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3 h-fit">
          <div className="text-sm font-semibold">{editId ? t('common.edit') : t('printers.add')}</div>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t('printers.name')}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          />
          <select
            value={form.connection}
            onChange={(e) => setForm({ ...form, connection: e.target.value })}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          >
            <option value="IP">IP (network)</option>
            <option value="USB">USB / serial</option>
            <option value="IOT">IOT / cloud</option>
          </select>
          {form.connection === 'USB' ? (
            <input
              value={form.usbPort}
              onChange={(e) => setForm({ ...form, usbPort: e.target.value })}
              placeholder="USB001 / COM3"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            />
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <input
                value={form.ipAddress}
                onChange={(e) => setForm({ ...form, ipAddress: e.target.value })}
                placeholder="192.168.1.250"
                className="col-span-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
              />
              <input
                type="number"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: parseInt(e.target.value, 10) || 9100 })}
                placeholder="9100"
                className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm"
              />
            </div>
          )}
          <label className="block text-xs text-gray-500">{t('printers.width')}
            <select
              value={form.widthMm}
              onChange={(e) => setForm({ ...form, widthMm: parseInt(e.target.value, 10) })}
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            >
              <option value={80}>80mm</option>
              <option value={58}>58mm</option>
            </select>
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
        </div>
      </div>
    </div>
  );
}
