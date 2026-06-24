import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';

type Tab = 'giftcards' | 'coupons';

export default function PromotionsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('giftcards');

  const [gcBalance, setGcBalance] = useState('');
  const [gcCode, setGcCode] = useState('');

  const [cpType, setCpType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [cpValue, setCpValue] = useState('');
  const [cpMin, setCpMin] = useState('');
  const [cpCode, setCpCode] = useState('');

  const { data: giftCards, isLoading: gcLoading } = useQuery({
    queryKey: ['gift-cards'],
    queryFn: () => api.get('/promotions/gift-cards').then((r) => r.data.data),
  });
  const { data: coupons, isLoading: cpLoading } = useQuery({
    queryKey: ['coupons'],
    queryFn: () => api.get('/promotions/coupons').then((r) => r.data.data),
  });

  const createGc = useMutation({
    mutationFn: () =>
      api.post('/promotions/gift-cards', { initialBalance: parseFloat(gcBalance), code: gcCode || undefined }),
    onSuccess: () => { toast.success('Gift card issued'); setGcBalance(''); setGcCode(''); qc.invalidateQueries({ queryKey: ['gift-cards'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const createCp = useMutation({
    mutationFn: () =>
      api.post('/promotions/coupons', {
        type: cpType,
        value: parseFloat(cpValue),
        minOrder: cpMin ? parseFloat(cpMin) : undefined,
        code: cpCode || undefined,
      }),
    onSuccess: () => { toast.success('Coupon created'); setCpValue(''); setCpMin(''); setCpCode(''); qc.invalidateQueries({ queryKey: ['coupons'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  return (
    <div>
      <PageHeader title={t('nav.promotions')} />
      <div className="flex gap-2 mb-4">
        {(['giftcards', 'coupons'] as Tab[]).map((x) => (
          <button key={x} onClick={() => setTab(x)}
            className={`px-3 py-1.5 rounded-lg text-sm ${tab === x ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-800'}`}>
            {x === 'giftcards' ? 'Gift Cards' : 'Coupons'}
          </button>
        ))}
      </div>

      {tab === 'giftcards' && (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            <input type="number" value={gcBalance} onChange={(e) => setGcBalance(e.target.value)} placeholder="Initial balance"
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
            <input value={gcCode} onChange={(e) => setGcCode(e.target.value)} placeholder="Code (optional)"
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
            <button disabled={!gcBalance || createGc.isPending} onClick={() => createGc.mutate()}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50">Issue gift card</button>
          </div>
          {gcLoading ? <LoadingSpinner /> : (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500">
                  <tr><th className="text-left px-3 py-2">Code</th><th className="text-right px-3 py-2">Balance</th><th className="text-right px-3 py-2">Initial</th><th className="text-left px-3 py-2">Active</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {(giftCards || []).map((g: any) => (
                    <tr key={g.id}>
                      <td className="px-3 py-2 font-mono text-xs">{g.code}</td>
                      <td className="px-3 py-2 text-right">{Number(g.balance).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{Number(g.initialBalance).toFixed(2)}</td>
                      <td className="px-3 py-2">{g.isActive ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                  {!giftCards?.length && <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">No gift cards.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'coupons' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-4">
            <select value={cpType} onChange={(e) => setCpType(e.target.value as any)}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm">
              <option value="PERCENT">Percent %</option>
              <option value="FIXED">Fixed amount</option>
            </select>
            <input type="number" value={cpValue} onChange={(e) => setCpValue(e.target.value)} placeholder={cpType === 'PERCENT' ? '% off' : 'Amount off'}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
            <input type="number" value={cpMin} onChange={(e) => setCpMin(e.target.value)} placeholder="Min order"
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
            <input value={cpCode} onChange={(e) => setCpCode(e.target.value)} placeholder="Code (optional)"
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
            <button disabled={!cpValue || createCp.isPending} onClick={() => createCp.mutate()}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50">Create coupon</button>
          </div>
          {cpLoading ? <LoadingSpinner /> : (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500">
                  <tr><th className="text-left px-3 py-2">Code</th><th className="text-left px-3 py-2">Type</th><th className="text-right px-3 py-2">Value</th><th className="text-right px-3 py-2">Min</th><th className="text-right px-3 py-2">Used</th><th className="text-left px-3 py-2">Active</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {(coupons || []).map((c: any) => (
                    <tr key={c.id}>
                      <td className="px-3 py-2 font-mono text-xs">{c.code}</td>
                      <td className="px-3 py-2">{c.type}</td>
                      <td className="px-3 py-2 text-right">{c.type === 'PERCENT' ? `${c.value}%` : Number(c.value).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{Number(c.minOrder).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{c.redeemedCount}{c.maxRedemptions ? `/${c.maxRedemptions}` : ''}</td>
                      <td className="px-3 py-2">{c.isActive ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                  {!coupons?.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">No coupons.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
