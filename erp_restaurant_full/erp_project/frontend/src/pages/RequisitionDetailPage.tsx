import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const STATUS_STEPS = [
  { status: 'SUBMITTED',               label: 'Submitted', icon: '📤' },
  { status: 'MANAGER_APPROVED',         label: 'Approved',  icon: '✅' },
  { status: 'ORDER_PLACED_WITH_SUPPLIER', label: 'Ordered',  icon: '📞' },
  { status: 'RECEIVED_AT_WAREHOUSE',    label: 'Warehouse', icon: '🏪' },
  { status: 'DISPATCHED_TO_BRANCH',     label: 'Dispatched',icon: '🚚' },
  { status: 'CONFIRMED_RECEIPT',        label: 'Received',  icon: '🎉' },
];

export default function RequisitionDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isRTL = i18n.language === 'ar';

  const [reviewModal, setReviewModal] = useState(false);
  const [dispatchModal, setDispatchModal] = useState(false);
  const [reviewAction, setReviewAction] = useState<'approve' | 'modify' | 'cancel'>('approve');
  const [reviewNotes, setReviewNotes] = useState('');
  const [modifiedQtys, setModifiedQtys] = useState<Record<number, number>>({});
  const [dispatchData, setDispatchData] = useState({ driverId: '', driverName: '', driverPhone: '', recipientName: '', trackingNotes: '' });

  const { data: req, isLoading } = useQuery({
    queryKey: ['requisition', id],
    queryFn: () => api.get(`/requisitions/${id}`).then(r => r.data.data),
    refetchInterval: 15000,
  });

  // Active drivers for the dispatch picker.
  const { data: drivers } = useQuery({
    queryKey: ['drivers-active'],
    queryFn: () => api.get('/drivers', { params: { active: 'true' } }).then(r => r.data.data),
  });

  const managerReview = useMutation({
    mutationFn: (data: any) => api.patch(`/requisitions/${id}/manager-review`, data),
    onSuccess: () => { toast.success('Review submitted'); qc.invalidateQueries({ queryKey: ['requisition', id] }); setReviewModal(false); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const procurementUpdate = useMutation({
    mutationFn: (data: any) => api.patch(`/requisitions/${id}/procurement-update`, data),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['requisition', id] }); setDispatchModal(false); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const confirmReceipt = useMutation({
    mutationFn: () => api.patch(`/requisitions/${id}/confirm-receipt`, {}),
    onSuccess: () => { toast.success('✅ Receipt confirmed!'); qc.invalidateQueries({ queryKey: ['requisition', id] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!req) return <div className="text-center py-16 text-gray-400">Not found</div>;

  const currentStepIdx = STATUS_STEPS.findIndex(s => s.status === req.status);
  const isManager = ['BRANCH_MANAGER', 'SUPER_ADMIN'].includes(user?.role || '');
  const isProcurement = ['PROCUREMENT', 'WAREHOUSE', 'SUPER_ADMIN'].includes(user?.role || '');
  const isStaff = ['KITCHEN', 'BARISTA', 'PASTRY', 'CASHIER', 'CLEANER'].includes(user?.role || '');

  const handleManagerReview = () => {
    const items = reviewAction === 'modify'
      ? req.items.map((item: any) => ({ id: item.id, approvedQty: modifiedQtys[item.id] ?? item.requestedQty }))
      : undefined;
    managerReview.mutate({ action: reviewAction, items, reviewNotes });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <PageHeader
        title={req.requisitionNo}
        subtitle={`${req.department} • ${isRTL ? req.branch?.nameAr : req.branch?.name}`}
        backTo="/requisitions"
        actions={
          <div className="flex gap-2">
            <StatusBadge status={req.status} />
            <button
              onClick={() => window.print()}
              className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-200 no-print"
            >
              🖨️ {t('common.print')}
            </button>
          </div>
        }
      />

      {/* Progress tracker */}
      {req.status !== 'MANAGER_CANCELLED' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">📍 Tracking</h3>
          <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-hide">
            {STATUS_STEPS.map((step, idx) => {
              const done = idx <= currentStepIdx;
              const active = idx === currentStepIdx;
              return (
                <div key={step.status} className="flex items-center gap-1 flex-shrink-0">
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm ${
                      active ? 'bg-brand-600 text-white ring-4 ring-brand-100 scale-110'
                        : done ? 'bg-brand-100 text-brand-600'
                        : 'bg-gray-100 text-gray-400'
                    }`}>
                      {step.icon}
                    </div>
                    <p className={`text-xs text-center max-w-16 leading-tight ${
                      active ? 'text-brand-700 font-semibold' : done ? 'text-gray-600' : 'text-gray-400'
                    }`}>
                      {step.label}
                    </p>
                  </div>
                  {idx < STATUS_STEPS.length - 1 && (
                    <div className={`h-0.5 w-6 flex-shrink-0 rounded-full mb-5 ${
                      idx < currentStepIdx ? 'bg-brand-400' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dispatch / Driver Details Card */}
      {req.dispatch && (
        <div className="bg-white rounded-2xl border border-orange-200 overflow-hidden">
          <div className="px-5 py-4 bg-orange-50 border-b border-orange-200">
            <h3 className="font-semibold text-orange-900">🚚 Dispatch Details</h3>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {req.dispatch.driverName && (
                <div className="flex items-start gap-3">
                  <span className="text-lg">👤</span>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Driver Name</p>
                    <p className="text-sm font-semibold text-gray-900">{req.dispatch.driverName}</p>
                  </div>
                </div>
              )}
              {req.dispatch.driverPhone && (
                <div className="flex items-start gap-3">
                  <span className="text-lg">📞</span>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Driver Phone</p>
                    <p className="text-sm font-semibold text-gray-900">
                      <a href={`tel:${req.dispatch.driverPhone}`} className="text-brand-600 hover:underline">
                        {req.dispatch.driverPhone}
                      </a>
                    </p>
                  </div>
                </div>
              )}
              {req.dispatch.recipientName && (
                <div className="flex items-start gap-3">
                  <span className="text-lg">📋</span>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Recipient</p>
                    <p className="text-sm font-semibold text-gray-900">{req.dispatch.recipientName}</p>
                  </div>
                </div>
              )}
              {req.dispatch.destinationBranch && (
                <div className="flex items-start gap-3">
                  <span className="text-lg">🏢</span>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Destination Branch</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {isRTL ? req.dispatch.destinationBranch.nameAr : req.dispatch.destinationBranch.name}
                    </p>
                  </div>
                </div>
              )}
              {req.dispatch.trackingNotes && (
                <div className="flex items-start gap-3 sm:col-span-2">
                  <span className="text-lg">📝</span>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Tracking Notes</p>
                    <p className="text-sm text-gray-700">{req.dispatch.trackingNotes}</p>
                  </div>
                </div>
              )}
            </div>
            {/* Timestamps */}
            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-orange-100">
              {req.dispatch.dispatchedAt && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">📤 Dispatched:</span>
                  <span className="text-xs font-medium text-gray-600">
                    {format(new Date(req.dispatch.dispatchedAt), 'MMM d, yyyy HH:mm')}
                  </span>
                </div>
              )}
              {req.dispatch.confirmedAt && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">✅ Confirmed:</span>
                  <span className="text-xs font-medium text-green-600">
                    {format(new Date(req.dispatch.confirmedAt), 'MMM d, yyyy HH:mm')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 no-print">
        {isManager && req.status === 'SUBMITTED' && (
          <>
            <button onClick={() => { setReviewAction('approve'); setReviewModal(true); }} className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium">✅ {t('requisition.approve')}</button>
            <button onClick={() => { setReviewAction('modify'); setReviewModal(true); }} className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium">✏️ {t('requisition.modify')}</button>
            <button onClick={() => { setReviewAction('cancel'); setReviewModal(true); }} className="flex-1 bg-red-500 hover:bg-red-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium">❌ {t('requisition.cancel')}</button>
          </>
        )}
        {isProcurement && ['MANAGER_APPROVED', 'MANAGER_MODIFIED'].includes(req.status) && (
          <>
            <button onClick={() => procurementUpdate.mutate({ status: 'ORDER_PLACED_WITH_SUPPLIER' })} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium">📞 Order from Supplier</button>
            <button onClick={() => procurementUpdate.mutate({ status: 'RECEIVED_AT_WAREHOUSE' })} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium">🏪 Mark at Warehouse</button>
          </>
        )}
        {isProcurement && req.status === 'ORDER_PLACED_WITH_SUPPLIER' && (
          <button onClick={() => procurementUpdate.mutate({ status: 'RECEIVED_AT_WAREHOUSE' })} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium">🏪 Received at Warehouse</button>
        )}
        {isProcurement && req.status === 'RECEIVED_AT_WAREHOUSE' && (
          <button onClick={() => setDispatchModal(true)} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium">🚚 Dispatch to Branch</button>
        )}
        {(isStaff || isManager) && req.status === 'DISPATCHED_TO_BRANCH' && (
          <button
            onClick={() => confirmReceipt.mutate()}
            disabled={confirmReceipt.isPending}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white px-4 py-2.5 rounded-xl text-sm font-medium"
          >
            {confirmReceipt.isPending ? 'Confirming...' : `🎉 ${t('requisition.confirmReceipt')}`}
          </button>
        )}
      </div>

      {/* Requisition Info */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">📄 Details</h3>
        </div>
        <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-500">Created By</p>
            <p className="text-sm font-medium text-gray-900">{req.createdBy?.firstName} {req.createdBy?.lastName}</p>
            <p className="text-xs text-gray-400">{req.createdBy?.role}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Priority</p>
            <p className="text-sm font-medium text-gray-900">{req.priority}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Created</p>
            <p className="text-sm font-medium text-gray-900">{format(new Date(req.createdAt), 'MMM d, yyyy HH:mm')}</p>
          </div>
          {req.neededBy && (
            <div>
              <p className="text-xs text-gray-500">Needed By</p>
              <p className="text-sm font-medium text-gray-900">{format(new Date(req.neededBy), 'MMM d, yyyy')}</p>
            </div>
          )}
          {req.reviewedBy && (
            <div>
              <p className="text-xs text-gray-500">Reviewed By</p>
              <p className="text-sm font-medium text-gray-900">{req.reviewedBy.firstName} {req.reviewedBy.lastName}</p>
              {req.reviewedAt && <p className="text-xs text-gray-400">{format(new Date(req.reviewedAt), 'MMM d, HH:mm')}</p>}
            </div>
          )}
          {req.processedBy && (
            <div>
              <p className="text-xs text-gray-500">Processed By</p>
              <p className="text-sm font-medium text-gray-900">{req.processedBy.firstName} {req.processedBy.lastName}</p>
              {req.processedAt && <p className="text-xs text-gray-400">{format(new Date(req.processedAt), 'MMM d, HH:mm')}</p>}
            </div>
          )}
          {req.reviewNotes && (
            <div className="col-span-2 sm:col-span-3">
              <p className="text-xs text-gray-500">Review Notes</p>
              <p className="text-sm text-gray-700">{req.reviewNotes}</p>
            </div>
          )}
          {req.notes && (
            <div className="col-span-2 sm:col-span-3">
              <p className="text-xs text-gray-500">Notes</p>
              <p className="text-sm text-gray-700">{req.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Items list */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{t('requisition.items')} ({req.items?.length})</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {req.items?.map((item: any) => (
            <div key={item.id} className="flex items-center gap-4 px-5 py-3">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                {item.product?.imageUrl
                  ? <img src={item.product.imageUrl} alt="" className="w-full h-full object-cover rounded-xl" />
                  : <span className="text-lg">📦</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{isRTL ? item.product?.nameAr : item.product?.name}</p>
                <p className="text-xs text-gray-500">{item.product?.sku}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-gray-900">
                  {item.approvedQty ?? item.requestedQty} <span className="text-xs text-gray-400">{item.unit?.abbreviation}</span>
                </p>
                {item.receivedQty !== null && item.receivedQty !== undefined && (
                  <p className="text-xs text-green-600">✓ Rcvd: {item.receivedQty}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Linked Purchase Orders */}
      {req.purchaseOrders?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">📝 Linked Purchase Orders</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {req.purchaseOrders.map((po: any) => (
              <div key={po.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-brand-700">{po.poNumber}</p>
                </div>
                <StatusBadge status={po.status} size="sm" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status history */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">📜 History</h3>
        </div>
        <div className="p-5">
          <ol className="relative border-s-2 border-gray-100 ms-2 space-y-5">
            {req.statusHistory?.map((h: any) => {
              const actor = h.changedBy ? `${h.changedBy.firstName} ${h.changedBy.lastName}` : 'System';
              const extra = h.status === 'DISPATCHED_TO_BRANCH' && req.dispatch?.driverName ? `Driver: ${req.dispatch.driverName}${req.dispatch.driverPhone ? ` (${req.dispatch.driverPhone})` : ''}` : '';
              return (
                <li key={h.id} className="ms-5">
                  <span className="absolute -start-[7px] mt-1.5 w-3 h-3 rounded-full bg-brand-500 ring-4 ring-white" />
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={h.status} size="sm" />
                    <span className="text-xs text-gray-500">by <span className="font-medium text-gray-700">{actor}</span></span>
                  </div>
                  {h.notes && <p className="text-xs text-gray-600 mt-1">{h.notes}</p>}
                  {extra && <p className="text-xs text-orange-600 mt-0.5">🚚 {extra}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">{format(new Date(h.createdAt), 'MMM d, yyyy HH:mm')}</p>
                </li>
              );
            })}
            {!req.statusHistory?.length && <li className="ms-5 text-sm text-gray-400">No history yet.</li>}
          </ol>
        </div>
      </div>

      {/* Manager Review Modal */}
      <Modal open={reviewModal} onClose={() => setReviewModal(false)} title={`Manager Review: ${reviewAction.toUpperCase()}`} size="lg">
        <div className="space-y-4">
          {reviewAction === 'modify' && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Adjust quantities:</p>
              {req.items?.map((item: any) => (
                <div key={item.id} className="flex items-center gap-3 mb-2">
                  <p className="flex-1 text-sm text-gray-700">{item.product?.name}</p>
                  <input
                    type="number" min={0} defaultValue={item.requestedQty}
                    onChange={e => setModifiedQtys(prev => ({ ...prev, [item.id]: +e.target.value }))}
                    className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center"
                  />
                  <span className="text-xs text-gray-400">{item.unit?.abbreviation}</span>
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setReviewModal(false)} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium">{t('common.cancel')}</button>
            <button
              onClick={handleManagerReview}
              disabled={managerReview.isPending}
              className={`flex-1 text-white py-2.5 rounded-xl text-sm font-medium ${
                reviewAction === 'approve' ? 'bg-green-600' : reviewAction === 'modify' ? 'bg-yellow-500' : 'bg-red-500'
              }`}
            >
              {managerReview.isPending ? 'Submitting...' : t('common.confirm')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Dispatch Modal */}
      <Modal open={dispatchModal} onClose={() => setDispatchModal(false)} title="🚚 Dispatch to Branch">
        <div className="space-y-4">
          {/* Driver picker — choose from the managed drivers list */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Driver *</label>
            <select
              value={dispatchData.driverId}
              onChange={e => {
                const d = drivers?.find((x: any) => String(x.id) === e.target.value);
                setDispatchData(prev => ({ ...prev, driverId: e.target.value, driverName: d?.name || '', driverPhone: d?.phone || '' }));
              }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
            >
              <option value="">Select a driver…</option>
              {drivers?.map((d: any) => <option key={d.id} value={d.id}>{d.name}{d.phone ? ` — ${d.phone}` : ''}{d.vehicle ? ` (${d.vehicle})` : ''}</option>)}
            </select>
            {(!drivers || drivers.length === 0) && (
              <p className="text-xs text-gray-400 mt-1">No drivers yet. Add drivers in Admin → Drivers.</p>
            )}
          </div>
          {dispatchData.driverId && dispatchData.driverPhone && (
            <p className="text-xs text-gray-500">📞 {dispatchData.driverName} · <a href={`tel:${dispatchData.driverPhone}`} className="text-brand-600 hover:underline">{dispatchData.driverPhone}</a></p>
          )}
          {[['recipientName', 'Recipient at Branch'], ['trackingNotes', 'Tracking Notes']].map(([key, label]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                value={(dispatchData as any)[key]}
                onChange={e => setDispatchData(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={key === 'recipientName' ? 'Person receiving at the branch' : 'Any delivery notes...'}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
          ))}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setDispatchModal(false)} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium">{t('common.cancel')}</button>
            <button
              onClick={() => procurementUpdate.mutate({ status: 'DISPATCHED_TO_BRANCH', driverId: dispatchData.driverId ? +dispatchData.driverId : undefined, driverName: dispatchData.driverName, driverPhone: dispatchData.driverPhone, recipientName: dispatchData.recipientName, trackingNotes: dispatchData.trackingNotes })}
              disabled={procurementUpdate.isPending || !dispatchData.driverId}
              className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white py-2.5 rounded-xl text-sm font-medium"
            >
              {procurementUpdate.isPending ? 'Dispatching...' : 'Confirm Dispatch'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
