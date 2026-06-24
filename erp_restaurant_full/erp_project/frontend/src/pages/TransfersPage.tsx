import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { PlusIcon, ArrowsRightLeftIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { Branch, Product, TransferOrder, FefoAllocation } from '../types';

interface LineDraft { productId: string; quantity: string; preview?: FefoAllocation[]; previewError?: string; }

const STATUS_TONE: Record<string, string> = {
  IN_TRANSIT: 'bg-amber-100 text-amber-800',
  RECEIVED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-500',
  DRAFT: 'bg-gray-100 text-gray-600',
};

export default function TransfersPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [modal, setModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [fromBranchId, setFromBranchId] = useState('');
  const [toBranchId, setToBranchId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ productId: '', quantity: '' }]);

  const { data: branches } = useQuery<Branch[]>({ queryKey: ['branches'], queryFn: () => api.get('/branches').then(r => r.data.data) });
  const { data: products } = useQuery<Product[]>({ queryKey: ['products'], queryFn: () => api.get('/products').then(r => r.data.data) });
  const { data: transfers, isLoading } = useQuery<TransferOrder[]>({
    queryKey: ['transfers', statusFilter],
    queryFn: () => api.get('/transfers', { params: { status: statusFilter || undefined } }).then(r => r.data.data),
  });

  const resetForm = () => {
    setFromBranchId(''); setToBranchId(''); setNotes('');
    setLines([{ productId: '', quantity: '' }]);
  };

  const createMutation = useMutation({
    mutationFn: () => api.post('/transfers', {
      fromBranchId: +fromBranchId,
      toBranchId: +toBranchId,
      notes: notes || undefined,
      items: lines
        .filter(l => l.productId && +l.quantity > 0)
        .map(l => ({ productId: +l.productId, quantity: +l.quantity })),
    }),
    onSuccess: () => {
      toast.success('Transfer dispatched — stock is now in transit');
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setModal(false); resetForm();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Transfer failed'),
  });

  const receiveMutation = useMutation({
    mutationFn: (id: number) => api.post(`/transfers/${id}/receive`),
    onSuccess: () => {
      toast.success('Received into destination stock ✓');
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Receive failed'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => api.post(`/transfers/${id}/cancel`),
    onSuccess: () => {
      toast.success('Transfer cancelled — stock returned to origin');
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Cancel failed'),
  });

  const previewFefo = async (idx: number) => {
    const l = lines[idx];
    if (!fromBranchId || !l.productId || !(+l.quantity > 0)) {
      toast.error('Select origin branch, product and quantity first');
      return;
    }
    try {
      const res = await api.get('/transfers/fefo-preview', {
        params: { fromBranchId: +fromBranchId, productId: +l.productId, quantity: +l.quantity },
      });
      setLines(prev => prev.map((x, i) => i === idx ? { ...x, preview: res.data.data, previewError: undefined } : x));
    } catch (e: any) {
      setLines(prev => prev.map((x, i) => i === idx ? { ...x, preview: undefined, previewError: e.response?.data?.message || 'No stock' } : x));
    }
  };

  const updateLine = (idx: number, patch: Partial<LineDraft>) =>
    setLines(prev => prev.map((x, i) => i === idx ? { ...x, ...patch, preview: undefined } : x));
  const addLine = () => setLines(prev => [...prev, { productId: '', quantity: '' }]);
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  const canReceive = (t: TransferOrder) =>
    t.status === 'IN_TRANSIT' && (user?.role === 'SUPER_ADMIN' || !user?.branchId || user.branchId === t.toBranchId);

  return (
    <div>
      <PageHeader
        title="Branch Transfers"
        subtitle="Move stock branch-to-branch with FEFO batch selection"
        actions={
          <button onClick={() => { resetForm(); setModal(true); }} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
            <PlusIcon className="w-4 h-4" /> New Transfer
          </button>
        }
      />

      <div className="flex gap-2 mb-4">
        {['', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'].map(s => (
          <button
            key={s || 'all'}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${statusFilter === s ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200'}`}
          >
            {s ? s.replace('_', ' ') : 'All'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !transfers?.length ? (
        <div className="text-center py-16 text-gray-400">
          <ArrowsRightLeftIcon className="w-10 h-10 mx-auto mb-2" />
          <p className="text-sm">No transfer orders yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {transfers.map(t => (
            <div key={t.id} className="border border-gray-100 rounded-xl p-4 bg-white">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{t.transferNo}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_TONE[t.status] || ''}`}>{t.status.replace('_', ' ')}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {t.fromBranch?.name} <span className="text-gray-400">→</span> {t.toBranch?.name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t.dispatchedAt ? `Dispatched ${format(new Date(t.dispatchedAt), 'MMM d, HH:mm')}` : ''}
                    {t.receivedAt ? ` · Received ${format(new Date(t.receivedAt), 'MMM d, HH:mm')}` : ''}
                  </p>
                </div>
                {t.status === 'IN_TRANSIT' && (
                  <div className="flex gap-2">
                    {canReceive(t) && (
                      <button onClick={() => receiveMutation.mutate(t.id)} disabled={receiveMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium">
                        Approve &amp; Receive
                      </button>
                    )}
                    <button onClick={() => cancelMutation.mutate(t.id)} disabled={cancelMutation.isPending} className="border border-gray-200 text-gray-600 text-xs px-3 py-1.5 rounded-lg">
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-3 border-t border-gray-50 pt-2">
                <table className="w-full text-xs">
                  <thead className="text-gray-400">
                    <tr><th className="text-start py-1">Item</th><th className="text-center">Qty</th><th className="text-start">Batch</th><th className="text-start">Expiry (moving)</th></tr>
                  </thead>
                  <tbody>
                    {t.items?.map(it => (
                      <tr key={it.id} className="text-gray-700">
                        <td className="py-1">{it.product?.name} <span className="text-gray-400">({it.product?.sku})</span></td>
                        <td className="text-center">{it.quantity}</td>
                        <td>{it.batch?.batchNumber || '—'}</td>
                        <td>{it.expiryDate ? format(new Date(it.expiryDate), 'MMM d, yyyy') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New transfer modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="New Branch Transfer" size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From Branch (Origin)</label>
              <select value={fromBranchId} onChange={e => { setFromBranchId(e.target.value); setLines(l => l.map(x => ({ ...x, preview: undefined }))); }} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                <option value="">Select origin</option>
                {branches?.map(b => <option key={b.id} value={b.id}>{b.name}{b.isWarehouse ? ' (Warehouse)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To Branch (Destination)</label>
              <select value={toBranchId} onChange={e => setToBranchId(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                <option value="">Select destination</option>
                {branches?.filter(b => String(b.id) !== fromBranchId).map(b => <option key={b.id} value={b.id}>{b.name}{b.isWarehouse ? ' (Warehouse)' : ''}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Items (FEFO selects oldest-expiry batches automatically)</label>
              <button onClick={addLine} className="text-xs text-brand-600 font-medium">+ Add item</button>
            </div>
            <div className="space-y-3">
              {lines.map((l, idx) => (
                <div key={idx} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-[11px] text-gray-500 mb-1">Product</label>
                      <select value={l.productId} onChange={e => updateLine(idx, { productId: e.target.value })} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                        <option value="">Select</option>
                        {products?.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="block text-[11px] text-gray-500 mb-1">Qty</label>
                      <input type="number" min={0} step="any" value={l.quantity} onChange={e => updateLine(idx, { quantity: e.target.value })} onBlur={() => { if (fromBranchId && l.productId && +l.quantity > 0) previewFefo(idx); }} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                    </div>
                    <button onClick={() => previewFefo(idx)} className="text-xs border border-gray-200 text-gray-600 px-2.5 py-2 rounded-lg whitespace-nowrap">FEFO Preview</button>
                    {lines.length > 1 && (
                      <button onClick={() => removeLine(idx)} className="p-2 text-gray-400 hover:text-red-500"><TrashIcon className="w-4 h-4" /></button>
                    )}
                  </div>
                  {l.preview && (
                    <div className="mt-2 text-xs bg-amber-50 rounded-lg p-2">
                      <p className="font-medium text-amber-800 mb-1">Batches that will move (earliest expiry first):</p>
                      {l.preview.map((a, i) => (
                        <div key={i} className="flex justify-between text-amber-900">
                          <span>{a.quantity} units</span>
                          <span>Expiry: {a.expiryDate ? format(new Date(a.expiryDate), 'MMM d, yyyy') : 'no expiry'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {l.previewError && <p className="mt-2 text-xs text-red-500">{l.previewError}</p>}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          </div>

          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button onClick={() => setModal(false)} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium">Cancel</button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !fromBranchId || !toBranchId || fromBranchId === toBranchId || !lines.some(l => l.productId && +l.quantity > 0)}
              className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white py-2.5 rounded-xl text-sm font-semibold"
            >
              {createMutation.isPending ? 'Dispatching…' : 'Dispatch (FEFO) → In Transit'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
