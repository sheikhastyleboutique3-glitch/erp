import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import StatusBadge from '../components/StatusBadge';

type Tab = 'tables' | 'reservations';

export default function TablesPage() {
  const { t } = useTranslation();
  const { activeBranch } = useAuth();
  const qc = useQueryClient();
  const branchId = activeBranch?.id;
  const [tab, setTab] = useState<Tab>('tables');

  const [tName, setTName] = useState('');
  const [tSeats, setTSeats] = useState('4');

  const [rName, setRName] = useState('');
  const [rPhone, setRPhone] = useState('');
  const [rWhen, setRWhen] = useState('');
  const [rSize, setRSize] = useState('2');

  const { data: tables, isLoading: tLoading } = useQuery({
    queryKey: ['tables', branchId ?? 'all'],
    queryFn: () => api.get('/tables', { params: branchId ? { branchId } : {} }).then((r) => r.data.data),
  });
  const { data: reservations, isLoading: rLoading } = useQuery({
    queryKey: ['reservations', branchId ?? 'all'],
    queryFn: () => api.get('/reservations', { params: branchId ? { branchId } : {} }).then((r) => r.data.data),
  });

  const createTable = useMutation({
    mutationFn: () => api.post('/tables', { branchId, name: tName, seats: parseInt(tSeats, 10) || 2 }),
    onSuccess: () => { toast.success('Table added'); setTName(''); qc.invalidateQueries({ queryKey: ['tables'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const setTableStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.patch(`/tables/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tables'] }),
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const createReservation = useMutation({
    mutationFn: () =>
      api.post('/reservations', {
        branchId,
        customerName: rName,
        phone: rPhone || undefined,
        reservedAt: new Date(rWhen).toISOString(),
        partySize: parseInt(rSize, 10) || 2,
      }),
    onSuccess: () => { toast.success('Reservation booked'); setRName(''); setRPhone(''); setRWhen(''); qc.invalidateQueries({ queryKey: ['reservations'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const setResStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.patch(`/reservations/${id}/status`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reservations'] }); qc.invalidateQueries({ queryKey: ['tables'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  return (
    <div>
      <PageHeader title={t('nav.tables')} subtitle={activeBranch?.name} />
      <div className="flex gap-2 mb-4">
        {(['tables', 'reservations'] as Tab[]).map((x) => (
          <button key={x} onClick={() => setTab(x)}
            className={`px-3 py-1.5 rounded-lg text-sm capitalize ${tab === x ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-800'}`}>
            {x}
          </button>
        ))}
      </div>
      {!branchId && <p className="text-xs text-amber-600 mb-3">Select a branch in the top bar first.</p>}

      {tab === 'tables' && (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            <input value={tName} onChange={(e) => setTName(e.target.value)} placeholder="Table name"
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
            <input type="number" value={tSeats} onChange={(e) => setTSeats(e.target.value)} placeholder="Seats"
              className="w-24 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
            <button disabled={!branchId || !tName || createTable.isPending} onClick={() => createTable.mutate()}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50">Add table</button>
          </div>
          {tLoading ? <LoadingSpinner /> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {(tables || []).map((tb: any) => (
                <div key={tb.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm">{tb.name}</span>
                    <StatusBadge status={tb.status} />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{tb.seats} seats</div>
                  <select value={tb.status} onChange={(e) => setTableStatus.mutate({ id: tb.id, status: e.target.value })}
                    className="mt-2 w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs">
                    {['AVAILABLE', 'OCCUPIED', 'RESERVED'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              ))}
              {!tables?.length && <p className="text-sm text-gray-400 col-span-full">No tables yet.</p>}
            </div>
          )}
        </>
      )}

      {tab === 'reservations' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-4">
            <input value={rName} onChange={(e) => setRName(e.target.value)} placeholder="Guest name"
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
            <input value={rPhone} onChange={(e) => setRPhone(e.target.value)} placeholder="Phone"
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
            <input type="datetime-local" value={rWhen} onChange={(e) => setRWhen(e.target.value)}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
            <input type="number" value={rSize} onChange={(e) => setRSize(e.target.value)} placeholder="Party"
              className="w-24 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
            <button disabled={!branchId || !rName || !rWhen || createReservation.isPending} onClick={() => createReservation.mutate()}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50">Book</button>
          </div>
          {rLoading ? <LoadingSpinner /> : (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500">
                  <tr>
                    <th className="text-left px-3 py-2">Guest</th>
                    <th className="text-left px-3 py-2">When</th>
                    <th className="text-right px-3 py-2">Party</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-right px-3 py-2">Set</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {(reservations || []).map((r: any) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2">{r.customerName || '—'}<div className="text-xs text-gray-400">{r.phone}</div></td>
                      <td className="px-3 py-2">{new Date(r.reservedAt).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{r.partySize}</td>
                      <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2 text-right">
                        <select value={r.status} onChange={(e) => setResStatus.mutate({ id: r.id, status: e.target.value })}
                          className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs">
                          {['BOOKED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                  {!reservations?.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">No reservations.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
