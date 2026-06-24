import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';

interface CartLine {
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
  const { activeBranch } = useAuth();
  const qc = useQueryClient();

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

  const addToCart = (p: any) => {
    setCart((prev) => {
      const found = prev.find((l) => l.productId === p.id);
      if (found) return prev.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { productId: p.id, name: p.name, unitPrice: p.costPrice ?? 0, quantity: 1 }];
    });
    setCoupon(null); // invalidate any applied coupon when the cart changes
  };
  const setQty = (id: number, q: number) =>
    setCart((prev) => prev.flatMap((l) => (l.productId === id ? (q <= 0 ? [] : [{ ...l, quantity: q }]) : [l])));
  const setPrice = (id: number, price: number) =>
    setCart((prev) => prev.map((l) => (l.productId === id ? { ...l, unitPrice: price } : l)));

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0), [cart]);
  const discount = coupon?.discount ?? 0;
  const total = Math.max(0, subtotal - discount);
  const paid = useMemo(() => tenders.reduce((s, t) => s + t.amount, 0), [tenders]);
  const remaining = Math.max(0, +(total - paid).toFixed(2));
  const change = Math.max(0, +(paid - total).toFixed(2));

  const addTender = () => {
    const amt = tenderAmount.trim() ? parseFloat(tenderAmount) : remaining;
    if (!(amt > 0)) {
      toast.error('Enter a payment amount');
      return;
    }
    if (payMethod === 'GIFT_CARD' && !giftCardCode.trim()) {
      toast.error('Enter a gift card code');
      return;
    }
    setTenders((prev) => [
      ...prev,
      {
        method: payMethod,
        amount: +amt.toFixed(2),
        ...(payMethod === 'GIFT_CARD' ? { giftCardCode: giftCardCode.trim() } : {}),
      },
    ]);
    setTenderAmount('');
    setGiftCardCode('');
  };
  const removeTender = (i: number) => setTenders((prev) => prev.filter((_, idx) => idx !== i));

  const applyCoupon = useMutation({
    mutationFn: () =>
      api
        .get(`/promotions/coupons/${encodeURIComponent(couponCode.trim())}/validate`, { params: { orderTotal: subtotal } })
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

  const charge = useMutation({
    mutationFn: async () => {
      if (!activeBranch?.id) throw new Error('Select a branch first');
      if (!cart.length) throw new Error('Cart is empty');
      if (!tenders.length) throw new Error('Add at least one payment');
      if (paid + 1e-6 < total) throw new Error(`Payment is short by ${remaining.toFixed(2)}`);
      const { data: created } = await api.post('/sales/orders', {
        branchId: activeBranch.id,
        channel,
        tableName: tableName || undefined,
        couponCode: coupon?.code,
        items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })),
      });
      const order = created.data;
      // Post each tender as its own payment (supports split: cash + card + gift card).
      for (const ten of tenders) {
        await api.post(`/sales/orders/${order.id}/payments`, {
          method: ten.method,
          amount: ten.amount,
          ...(ten.method === 'GIFT_CARD' ? { giftCardCode: ten.giftCardCode } : {}),
        });
      }
      const { data: done } = await api.post(`/sales/orders/${order.id}/complete`, {});
      return done.data;
    },
    onSuccess: (order) => {
      toast.success(`Sale ${order.orderNo} completed`);
      setLastReceipt(order);
      setCart([]);
      setTableName('');
      setCouponCode('');
      setCoupon(null);
      setGiftCardCode('');
      setTenderAmount('');
      setTenders([]);
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['kds-board'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || e.message || 'Sale failed'),
  });

  return (
    <div>
      <PageHeader title={t('nav.pos')} subtitle={activeBranch?.name} />
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
                  onClick={() => addToCart(p)}
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

        {/* Cart */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex flex-col">
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

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 -mx-1">
            {cart.map((l) => (
              <div key={l.productId} className="px-1 py-2">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 flex-1 line-clamp-1">{l.name}</span>
                  <button onClick={() => setQty(l.productId, l.quantity - 1)} className="w-7 h-7 rounded bg-gray-100 dark:bg-gray-800">−</button>
                  <span className="w-6 text-center text-sm">{l.quantity}</span>
                  <button onClick={() => setQty(l.productId, l.quantity + 1)} className="w-7 h-7 rounded bg-gray-100 dark:bg-gray-800">+</button>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <input
                    type="number"
                    value={l.unitPrice}
                    onChange={(e) => setPrice(l.productId, parseFloat(e.target.value) || 0)}
                    className="w-24 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs"
                  />
                  <span className="text-sm font-semibold">{(l.unitPrice * l.quantity).toFixed(2)}</span>
                </div>
              </div>
            ))}
            {!cart.length && <p className="text-sm text-gray-400 py-8 text-center">Tap products to add them.</p>}
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
              onClick={() => couponCode.trim() && applyCoupon.mutate()}
              disabled={!couponCode.trim() || !cart.length || applyCoupon.isPending}
              className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm disabled:opacity-50"
            >
              Apply
            </button>
          </div>

          {/* Payment composer (supports split tender) */}
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
            <button
              onClick={addTender}
              disabled={!cart.length}
              className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm disabled:opacity-50"
            >
              Add payment
            </button>
          </div>
          {tenders.length > 0 && (
            <div className="mt-2 space-y-1">
              {tenders.map((ten, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center text-xs bg-gray-50 dark:bg-gray-800/60 rounded px-2 py-1"
                >
                  <span>
                    {ten.method.replace('_', ' ')}
                    {ten.giftCardCode ? ` · ${ten.giftCardCode}` : ''}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{ten.amount.toFixed(2)}</span>
                    <button onClick={() => removeTender(i)} className="text-red-600" aria-label="Remove payment">
                      ✕
                    </button>
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
                <span>Coupon {coupon?.code}</span>
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
              disabled={!cart.length || remaining > 0 || charge.isPending}
              onClick={() => charge.mutate()}
              className="w-full mt-2 py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-50"
            >
              {charge.isPending
                ? 'Processing…'
                : remaining > 0
                ? `Add ${remaining.toFixed(2)} to complete`
                : 'Complete sale'}
            </button>
          </div>

          {lastReceipt && (
            <div className="mt-3 text-xs text-gray-500">
              Last: {lastReceipt.orderNo} · total {Number(lastReceipt.total).toFixed(2)} · food cost{' '}
              {Number(lastReceipt.foodCost).toFixed(2)} · GP {Number(lastReceipt.grossProfit).toFixed(2)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
