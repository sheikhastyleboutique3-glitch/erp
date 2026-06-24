import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import PosSessionBar from '../components/PosSessionBar';
import { printReceipt } from '../lib/thermalPrint';

interface CartLine {
  itemId?: number; // present when the line lives on a persisted (loaded) order
  productId: number;
  name: string;
  unitPrice: number;
  quantity: number;
}
type Channel = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'QR';
type PayMethod = 'CASH' | 'CARD' | 'GIFT_CARD';
interface Tender {
  method: PayMethod;
  amount: number;
  giftCardCode?: string;
}

export default function POSPage() {
  const { t } = useTranslation();
  const { activeBranch, user } = useAuth();
  const qc = useQueryClient();
  const branchId = activeBranch?.id;
  const canRefund = user?.role === 'SUPER_ADMIN' || user?.role === 'BRANCH_MANAGER';

  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [channel, setChannel] = useState<Channel>('DINE_IN');
  const [tableName, setTableName] = useState('');
  const [payMethod, setPayMethod] = useState<PayMethod>('CASH');
  const [giftCardCode, setGiftCardCode] = useState('');
  const [tenderAmount, setTenderAmount] = useState('');
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [lastReceipt, setLastReceipt] = useState<any>(null);
  // When set, the POS is settling an EXISTING order (e.g. a waiter's bill).
  const [loadedOrderId, setLoadedOrderId] = useState<number | null>(null);

  const mode: 'new' | 'existing' = loadedOrderId ? 'existing' : 'new';

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data.data),
    staleTime: 300_000,
  });
  const { data: products, isLoading } = useQuery({
    queryKey: ['pos-products', categoryId, search],
    queryFn: () =>
      api
        .get('/products', { params: { ...(categoryId && { categoryId }), ...(search && { search }) } })
        .then((r) => r.data.data),
    staleTime: 60_000,
  });

  // Branding / business info for receipts (company name, logo, address…).
  const { data: settings } = useQuery({
    queryKey: ['settings-receipt'],
    queryFn: () => api.get('/settings').then((r) => r.data.data),
    staleTime: 300_000,
  });
  const businessInfo = useMemo(() => {
    const map: Record<string, string> = {};
    (settings || []).forEach((s: any) => {
      map[s.key] = s.value;
    });
    return {
      businessName: map.company_name || undefined,
      branchName: activeBranch?.name,
      logoUrl: map.company_logo ? `${window.location.origin}${map.company_logo}` : undefined,
      address: map.company_address || undefined,
      phone: map.company_phone || undefined,
      taxId: map.company_tax_id || undefined,
    };
  }, [settings, activeBranch]);

  // POS session guard — selling requires an open cash session (Odoo POS behaviour).
  const { data: posSession } = useQuery({
    queryKey: ['pos-session-current', branchId],
    queryFn: () => api.get('/pos-sessions/current', { params: { branchId } }).then((r) => r.data.data),
    enabled: !!branchId,
    refetchInterval: 30_000,
  });

  // Open + held bills for this branch (waiter tickets waiting to be settled).
  const { data: pendingBills } = useQuery({
    queryKey: ['pos-pending', branchId],
    queryFn: async () => {
      const [open, held] = await Promise.all([
        api.get('/sales/orders', { params: { branchId, status: 'OPEN' } }).then((r) => r.data.data),
        api.get('/sales/orders', { params: { branchId, status: 'HELD' } }).then((r) => r.data.data),
      ]);
      return [...(open || []), ...(held || [])];
    },
    enabled: !!branchId,
    refetchInterval: 15_000,
  });

  const { data: loadedOrder } = useQuery({
    queryKey: ['pos-loaded', loadedOrderId],
    queryFn: () => api.get(`/sales/orders/${loadedOrderId}`).then((r) => r.data.data),
    enabled: !!loadedOrderId,
  });

  const refetchLoaded = () => {
    qc.invalidateQueries({ queryKey: ['pos-loaded', loadedOrderId] });
    qc.invalidateQueries({ queryKey: ['pos-pending'] });
  };

  // ---- New-sale local cart helpers ----
  const addToCart = (p: any) => {
    setCart((prev) => {
      const found = prev.find((l) => l.productId === p.id);
      if (found) return prev.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { productId: p.id, name: p.name, unitPrice: p.costPrice ?? 0, quantity: 1 }];
    });
    setCoupon(null);
  };
  const setQty = (id: number, q: number) =>
    setCart((prev) => prev.flatMap((l) => (l.productId === id ? (q <= 0 ? [] : [{ ...l, quantity: q }]) : [l])));
  const setPrice = (id: number, price: number) =>
    setCart((prev) => prev.map((l) => (l.productId === id ? { ...l, unitPrice: price } : l)));

  // ---- Existing-order mutations ----
  const addItemMut = useMutation({
    mutationFn: (p: any) =>
      api.post(`/sales/orders/${loadedOrderId}/items`, { productId: p.id, quantity: 1, unitPrice: p.costPrice ?? 0 }),
    onSuccess: refetchLoaded,
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to add item'),
  });
  const removeItemMut = useMutation({
    mutationFn: (itemId: number) => api.delete(`/sales/orders/${loadedOrderId}/items/${itemId}`),
    onSuccess: refetchLoaded,
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to remove item'),
  });

  const onProduct = (p: any) => (mode === 'existing' ? addItemMut.mutate(p) : addToCart(p));

  const loadBill = (order: any) => {
    setLoadedOrderId(order.id);
    setCart([]);
    setCoupon(null);
    setCouponCode(order.couponCode || '');
    setTenders([]);
    setTenderAmount('');
    setChannel(order.channel || 'DINE_IN');
    setTableName(order.tableName || '');
  };
  const closeBill = () => {
    setLoadedOrderId(null);
    setTenders([]);
    setTenderAmount('');
    setCouponCode('');
  };

  // ---- Derived display values (mode-aware) ----
  const lines: CartLine[] = useMemo(() => {
    if (mode === 'existing') {
      return (loadedOrder?.items || []).map((it: any) => ({
        itemId: it.id,
        productId: it.productId,
        name: it.product?.name ?? `#${it.productId}`,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
      }));
    }
    return cart;
  }, [mode, loadedOrder, cart]);

  const cartSubtotal = useMemo(() => cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0), [cart]);
  const subtotal = mode === 'existing' ? loadedOrder?.subtotal ?? 0 : cartSubtotal;
  const discount = mode === 'existing' ? loadedOrder?.couponDiscount ?? 0 : coupon?.discount ?? 0;
  const total = mode === 'existing' ? loadedOrder?.total ?? 0 : Math.max(0, cartSubtotal - (coupon?.discount ?? 0));
  const appliedCouponCode = mode === 'existing' ? loadedOrder?.couponCode : coupon?.code;

  const paid = useMemo(() => tenders.reduce((s, t) => s + t.amount, 0), [tenders]);
  const remaining = Math.max(0, +(total - paid).toFixed(2));
  const change = Math.max(0, +(paid - total).toFixed(2));

  const addTender = () => {
    const amt = tenderAmount.trim() ? parseFloat(tenderAmount) : remaining;
    if (!(amt > 0)) return toast.error('Enter a payment amount');
    if (payMethod === 'GIFT_CARD' && !giftCardCode.trim()) return toast.error('Enter a gift card code');
    setTenders((prev) => [
      ...prev,
      { method: payMethod, amount: +amt.toFixed(2), ...(payMethod === 'GIFT_CARD' ? { giftCardCode: giftCardCode.trim() } : {}) },
    ]);
    setTenderAmount('');
    setGiftCardCode('');
  };
  const removeTender = (i: number) => setTenders((prev) => prev.filter((_, idx) => idx !== i));

  // ---- Coupon ----
  const applyCouponNew = useMutation({
    mutationFn: () =>
      api
        .get(`/promotions/coupons/${encodeURIComponent(couponCode.trim())}/validate`, { params: { orderTotal: cartSubtotal } })
        .then((r) => r.data.data),
    onSuccess: (res: any) => {
      setCoupon({ code: res.code, discount: res.discount });
      toast.success(`Coupon ${res.code}: −${res.discount.toFixed(2)}`);
    },
    onError: (e: any) => {
      setCoupon(null);
      toast.error(e.response?.data?.message || 'Invalid coupon');
    },
  });
  const applyCouponExisting = useMutation({
    mutationFn: () => api.patch(`/sales/orders/${loadedOrderId}/coupon`, { code: couponCode.trim() }),
    onSuccess: () => {
      refetchLoaded();
      toast.success('Coupon applied');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Invalid coupon'),
  });
  const onApplyCoupon = () => {
    if (!couponCode.trim()) return;
    mode === 'existing' ? applyCouponExisting.mutate() : applyCouponNew.mutate();
  };

  // ---- Checkout (both modes) ----
  const charge = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error('Select a branch first');
      if (!lines.length) throw new Error('Cart is empty');
      if (!tenders.length) throw new Error('Add at least one payment');
      if (paid + 1e-6 < total) throw new Error(`Payment is short by ${remaining.toFixed(2)}`);

      let orderId: number;
      if (mode === 'existing') {
        orderId = loadedOrderId as number;
      } else {
        const { data: created } = await api.post('/sales/orders', {
          branchId,
          channel,
          tableName: tableName || undefined,
          couponCode: coupon?.code,
          items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })),
        });
        orderId = created.data.id;
      }
      for (const ten of tenders) {
        await api.post(`/sales/orders/${orderId}/payments`, {
          method: ten.method,
          amount: ten.amount,
          ...(ten.method === 'GIFT_CARD' ? { giftCardCode: ten.giftCardCode } : {}),
        });
      }
      const { data: done } = await api.post(`/sales/orders/${orderId}/complete`, {});
      return done.data;
    },
    onSuccess: (order) => {
      toast.success(`Sale ${order.orderNo} completed`);
      setLastReceipt(order);
      // Auto-print the customer receipt right after payment.
      printReceipt(order, businessInfo);
      setCart([]);
      setTableName('');
      setCouponCode('');
      setCoupon(null);
      setGiftCardCode('');
      setTenderAmount('');
      setTenders([]);
      setLoadedOrderId(null);
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['kds-board'] });
      qc.invalidateQueries({ queryKey: ['pos-pending'] });
      qc.invalidateQueries({ queryKey: ['waiter-tables'] });
      qc.invalidateQueries({ queryKey: ['waiter-active-orders'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || e.message || 'Sale failed'),
  });

  const refund = useMutation({
    mutationFn: (orderId: number) => api.post(`/sales/orders/${orderId}/refund`, {}).then((r) => r.data.data),
    onSuccess: (order) => {
      toast.success(`Order ${order.orderNo} refunded`);
      setLastReceipt(order);
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['pos-pending'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || e.message || 'Refund failed'),
  });

  return (
    <div>
      <PageHeader title={t('nav.pos')} subtitle={activeBranch?.name} />
      <PosSessionBar branchId={branchId} businessInfo={businessInfo} />

      {/* Pending bills (waiter handoff) */}
      {(pendingBills?.length ?? 0) > 0 && (
        <div className="mb-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <div className="text-xs font-semibold text-gray-500 mb-2">{t('pos.pendingBills')}</div>
          <div className="flex flex-wrap gap-2">
            {(pendingBills || []).map((o: any) => (
              <button
                key={o.id}
                onClick={() => loadBill(o)}
                className={`px-3 py-2 rounded-lg text-sm border ${
                  loadedOrderId === o.id
                    ? 'bg-primary text-white border-primary'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                }`}
              >
                {o.tableName ? `${t('pos.table')} ${o.tableName}` : o.orderNo.slice(-6)}
                <span className="ms-2 opacity-80">{Number(o.total).toFixed(2)}</span>
                {o.status === 'HELD' && <span className="ms-1">⏸</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Catalog */}
        <div className="lg:col-span-2">
          <div className="flex flex-wrap gap-2 mb-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="flex-1 min-w-[160px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            />
            <button
              onClick={() => setCategoryId(undefined)}
              className={`px-3 py-2 rounded-lg text-sm ${!categoryId ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-800'}`}
            >
              All
            </button>
            {(categories || []).slice(0, 8).map((c: any) => (
              <button
                key={c.id}
                onClick={() => setCategoryId(c.id)}
                className={`px-3 py-2 rounded-lg text-sm ${categoryId === c.id ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-800'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
          {isLoading ? (
            <LoadingSpinner />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {(products || []).map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => onProduct(p)}
                  className="text-left rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 hover:border-primary hover:shadow-sm transition"
                >
                  <div className="font-medium text-sm text-gray-900 dark:text-gray-100 line-clamp-2">{p.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{p.sku}</div>
                </button>
              ))}
              {!products?.length && <p className="text-sm text-gray-500 col-span-full">No products found.</p>}
            </div>
          )}
        </div>

        {/* Cart / bill */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex flex-col">
          {mode === 'existing' ? (
            <div className="flex items-center justify-between mb-3 rounded-lg bg-primary/10 px-3 py-2">
              <div className="text-sm font-medium text-primary">
                {t('pos.settling')}: {loadedOrder?.tableName ? `${t('pos.table')} ${loadedOrder.tableName}` : loadedOrder?.orderNo}
              </div>
              <button onClick={closeBill} className="text-xs text-gray-500 hover:text-gray-700" aria-label="Close bill">✕</button>
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-3">
                {(['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'QR'] as Channel[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setChannel(c)}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs ${channel === c ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-800'}`}
                  >
                    {c.replace('_', ' ')}
                  </button>
                ))}
              </div>
              {channel === 'DINE_IN' && (
                <input
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="Table (optional)"
                  className="mb-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                />
              )}
            </>
          )}

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 -mx-1 min-h-[6rem]">
            {lines.map((l) => (
              <div key={l.itemId ?? l.productId} className="px-1 py-2">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 flex-1 line-clamp-1">{l.name}</span>
                  {mode === 'new' ? (
                    <>
                      <button onClick={() => setQty(l.productId, l.quantity - 1)} className="w-7 h-7 rounded bg-gray-100 dark:bg-gray-800">−</button>
                      <span className="w-6 text-center text-sm">{l.quantity}</span>
                      <button onClick={() => setQty(l.productId, l.quantity + 1)} className="w-7 h-7 rounded bg-gray-100 dark:bg-gray-800">+</button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm">×{l.quantity}</span>
                      <button onClick={() => l.itemId && removeItemMut.mutate(l.itemId)} className="text-red-600 text-sm" aria-label="Remove">✕</button>
                    </>
                  )}
                </div>
                <div className="flex justify-between items-center mt-1">
                  {mode === 'new' ? (
                    <input
                      type="number"
                      value={l.unitPrice}
                      onChange={(e) => setPrice(l.productId, parseFloat(e.target.value) || 0)}
                      className="w-24 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs"
                    />
                  ) : (
                    <span className="text-xs text-gray-500">{l.unitPrice.toFixed(2)}</span>
                  )}
                  <span className="text-sm font-semibold">{(l.unitPrice * l.quantity).toFixed(2)}</span>
                </div>
              </div>
            ))}
            {!lines.length && <p className="text-sm text-gray-400 py-8 text-center">Tap products to add them.</p>}
          </div>

          {/* Coupon */}
          <div className="border-t border-gray-200 dark:border-gray-800 mt-3 pt-3 flex gap-2">
            <input
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              placeholder="Coupon code"
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            />
            <button
              onClick={onApplyCoupon}
              disabled={!couponCode.trim() || !lines.length || applyCouponNew.isPending || applyCouponExisting.isPending}
              className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm disabled:opacity-50"
            >
              Apply
            </button>
          </div>

          {/* Payment composer (split tender) */}
          <div className="flex gap-2 mt-3">
            {(['CASH', 'CARD', 'GIFT_CARD'] as PayMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => setPayMethod(m)}
                className={`flex-1 px-2 py-1.5 rounded-lg text-xs ${payMethod === m ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-800'}`}
              >
                {m.replace('_', ' ')}
              </button>
            ))}
          </div>
          {payMethod === 'GIFT_CARD' && (
            <input
              value={giftCardCode}
              onChange={(e) => setGiftCardCode(e.target.value)}
              placeholder="Gift card code"
              className="mt-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            />
          )}
          <div className="flex gap-2 mt-2">
            <input
              type="number"
              value={tenderAmount}
              onChange={(e) => setTenderAmount(e.target.value)}
              placeholder={remaining > 0 ? `Amount (${remaining.toFixed(2)})` : 'Amount'}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            />
            <button onClick={addTender} disabled={!lines.length} className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm disabled:opacity-50">
              Add payment
            </button>
          </div>
          {tenders.length > 0 && (
            <div className="mt-2 space-y-1">
              {tenders.map((ten, i) => (
                <div key={i} className="flex justify-between items-center text-xs bg-gray-50 dark:bg-gray-800/60 rounded px-2 py-1">
                  <span>
                    {ten.method.replace('_', ' ')}
                    {ten.giftCardCode ? ` · ${ten.giftCardCode}` : ''}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{ten.amount.toFixed(2)}</span>
                    <button onClick={() => removeTender(i)} className="text-red-600" aria-label="Remove payment">✕</button>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-gray-200 dark:border-gray-800 mt-3 pt-3">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span>
              <span>{subtotal.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Coupon {appliedCouponCode}</span>
                <span>−{discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold my-2">
              <span>Total</span>
              <span>{total.toFixed(2)}</span>
            </div>
            {tenders.length > 0 && (
              <>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Paid</span>
                  <span>{paid.toFixed(2)}</span>
                </div>
                {remaining > 0 && (
                  <div className="flex justify-between text-sm text-amber-600">
                    <span>Remaining</span>
                    <span>{remaining.toFixed(2)}</span>
                  </div>
                )}
                {change > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Change</span>
                    <span>{change.toFixed(2)}</span>
                  </div>
                )}
              </>
            )}
            <button
              disabled={!lines.length || remaining > 0 || charge.isPending || !posSession}
              onClick={() => charge.mutate()}
              className="w-full mt-2 py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-50"
            >
              {charge.isPending ? 'Processing…' : !posSession ? t('pos.session.openSessionFirst') : remaining > 0 ? `Add ${remaining.toFixed(2)} to complete` : 'Complete sale'}
            </button>
          </div>

          {lastReceipt && (
            <div className="mt-3 border-t border-gray-200 dark:border-gray-800 pt-3">
              <button
                onClick={() => printReceipt(lastReceipt, businessInfo)}
                className="w-full py-2.5 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium flex items-center justify-center gap-2"
              >
                🖨 {t('pos.printReceipt')}
              </button>
              <div className="mt-2 text-xs text-gray-500">
                Last: {lastReceipt.orderNo} · total {Number(lastReceipt.total).toFixed(2)} · food cost{' '}
                {Number(lastReceipt.foodCost).toFixed(2)} · GP {Number(lastReceipt.grossProfit).toFixed(2)}
                {lastReceipt.status === 'REFUNDED' && <span className="ms-2 text-red-600 font-medium">· {t('pos.refunded')}</span>}
              </div>
              {canRefund && lastReceipt.status === 'COMPLETED' && (
                <button
                  onClick={() => {
                    if (window.confirm(t('pos.refundConfirm'))) refund.mutate(lastReceipt.id);
                  }}
                  disabled={refund.isPending}
                  className="w-full mt-2 py-2 rounded-xl border border-red-300 text-red-600 text-sm font-medium disabled:opacity-50"
                >
                  {t('pos.refund')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
