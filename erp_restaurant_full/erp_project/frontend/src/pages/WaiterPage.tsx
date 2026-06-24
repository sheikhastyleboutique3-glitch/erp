import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import { printKot } from '../lib/thermalPrint';

interface TableRow { id: number; name: string; seats: number; status: string; branchId: number; isActive: boolean }
interface OrderRow { id: number; orderNo: string; status: string; tableName?: string | null; total: number }

// Floor-plan tile tone per table status.
const statusTone: Record<string, string> = {
  AVAILABLE: 'border-emerald-300 bg-emerald-50 dark:bg-emerald-500/10',
  OCCUPIED: 'border-amber-300 bg-amber-50 dark:bg-amber-500/10',
  BILL_REQUESTED: 'border-red-300 bg-red-50 dark:bg-red-500/10',
  RESERVED: 'border-sky-300 bg-sky-50 dark:bg-sky-500/10',
};
const statusDot: Record<string, string> = {
  AVAILABLE: 'bg-emerald-500',
  OCCUPIED: 'bg-amber-500',
  BILL_REQUESTED: 'bg-red-500',
  RESERVED: 'bg-sky-500',
};

export default function WaiterPage() {
  const { t } = useTranslation();
  const { activeBranch, user } = useAuth();
  const qc = useQueryClient();
  const branchId = activeBranch?.id;

  const [selectedTable, setSelectedTable] = useState<TableRow | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState('');
  // Track which order items have already been printed to the kitchen so
  // "Send to kitchen" only fires the new lines.
  const [sentItemIds, setSentItemIds] = useState<Set<number>>(new Set());
  const [splitMode, setSplitMode] = useState(false);
  const [splitSel, setSplitSel] = useState<number[]>([]);
  const seededOrderRef = useRef<number | null>(null);

  const waiterName = user ? `${user.firstName} ${user.lastName}` : undefined;

  // ---- Floor-plan data ----
  const { data: tables, isLoading: tablesLoading } = useQuery({
    queryKey: ['waiter-tables', branchId],
    queryFn: () => api.get('/tables', { params: { branchId } }).then((r) => r.data.data),
    enabled: !!branchId,
    refetchInterval: 15_000,
  });

  // Open + held orders, so we can show which table is busy and resume bills.
  const { data: activeOrders } = useQuery({
    queryKey: ['waiter-active-orders', branchId],
    queryFn: async () => {
      const [open, held] = await Promise.all([
        api.get('/sales/orders', { params: { branchId, status: 'OPEN' } }).then((r) => r.data.data),
        api.get('/sales/orders', { params: { branchId, status: 'HELD' } }).then((r) => r.data.data),
      ]);
      return [...(open || []), ...(held || [])] as OrderRow[];
    },
    enabled: !!branchId,
    refetchInterval: 15_000,
  });

  const orderForTable = (name: string): OrderRow | undefined =>
    (activeOrders || []).find((o) => o.tableName === name);

  // ---- Menu data (only needed once a table is open) ----
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data.data),
    staleTime: 300_000,
    enabled: !!selectedTable,
  });
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['waiter-products', categoryId, search],
    queryFn: () =>
      api
        .get('/products', { params: { sellable: true, ...(categoryId && { categoryId }), ...(search && { search }) } })
        .then((r) => r.data.data),
    staleTime: 60_000,
    enabled: !!selectedTable,
  });
  const { data: stock } = useQuery({
    queryKey: ['waiter-stock', branchId],
    queryFn: () => api.get('/inventory/grouped', { params: { branchId } }).then((r) => r.data.data),
    enabled: !!selectedTable && !!branchId,
    staleTime: 30_000,
  });
  const stockMap = useMemo(() => {
    const m = new Map<number, number>();
    (stock || []).forEach((row: any) => m.set(row.productId, row.quantity));
    return m;
  }, [stock]);

  // ---- Current order detail ----
  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ['waiter-order', activeOrderId],
    queryFn: () => api.get(`/sales/orders/${activeOrderId}`).then((r) => r.data.data),
    enabled: !!activeOrderId,
  });

  const refreshTablesAndOrders = () => {
    qc.invalidateQueries({ queryKey: ['waiter-tables'] });
    qc.invalidateQueries({ queryKey: ['waiter-active-orders'] });
  };

  // ---- Mutations ----
  const setTableStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.patch(`/tables/${id}`, { status }),
    onSuccess: refreshTablesAndOrders,
  });

  const openTable = useMutation({
    mutationFn: async (table: TableRow) => {
      const existing = orderForTable(table.name);
      if (existing) {
        if (existing.status === 'HELD') await api.patch(`/sales/orders/${existing.id}/resume`, {});
        return existing.id;
      }
      const { data } = await api.post('/sales/orders', {
        branchId,
        channel: 'DINE_IN',
        tableName: table.name,
      });
      // Mark the table occupied when a fresh ticket opens.
      if (table.status === 'AVAILABLE' || table.status === 'RESERVED') {
        await api.patch(`/tables/${table.id}`, { status: 'OCCUPIED' }).catch(() => {});
      }
      return data.data.id as number;
    },
    onSuccess: (orderId, table) => {
      setSelectedTable(table);
      setActiveOrderId(orderId);
      refreshTablesAndOrders();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || e.message || 'Failed to open table'),
  });

  const addItem = useMutation({
    mutationFn: (p: any) =>
      api.post(`/sales/orders/${activeOrderId}/items`, {
        productId: p.id,
        quantity: 1,
        unitPrice: p.costPrice ?? 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['waiter-order', activeOrderId] });
      qc.invalidateQueries({ queryKey: ['waiter-active-orders'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to add item'),
  });

  const removeItem = useMutation({
    mutationFn: (itemId: number) => api.delete(`/sales/orders/${activeOrderId}/items/${itemId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['waiter-order', activeOrderId] });
      qc.invalidateQueries({ queryKey: ['waiter-active-orders'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to remove item'),
  });

  const holdOrder = useMutation({
    mutationFn: () => api.patch(`/sales/orders/${activeOrderId}/hold`, {}),
    onSuccess: () => {
      toast.success(t('waiter.held'));
      backToFloor();
      refreshTablesAndOrders();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const requestBill = useMutation({
    mutationFn: async () => {
      if (selectedTable) await api.patch(`/tables/${selectedTable.id}`, { status: 'BILL_REQUESTED' });
    },
    onSuccess: () => {
      toast.success(t('waiter.billRequested'));
      backToFloor();
      refreshTablesAndOrders();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const backToFloor = () => {
    setSelectedTable(null);
    setActiveOrderId(null);
    setSearch('');
    setCategoryId(undefined);
    setSplitMode(false);
    setSplitSel([]);
  };

  // Tables other than the current one (for transfer); and those with an active bill (for merge).
  const otherTables = (tables || []).filter((tb: TableRow) => tb.isActive && tb.name !== selectedTable?.name);
  const mergeableOrders = (activeOrders || []).filter((o) => o.id !== activeOrderId && o.tableName);

  const transferMut = useMutation({
    mutationFn: (tableName: string) => api.patch(`/sales/orders/${activeOrderId}/table`, { tableName }),
    onSuccess: (r: any) => {
      toast.success(t('waiter.transferred'));
      setSelectedTable((prev) => (prev ? { ...prev, name: r.data.data.tableName } : prev));
      refreshTablesAndOrders();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const mergeMut = useMutation({
    mutationFn: (fromOrderId: number) => api.post(`/sales/orders/${activeOrderId}/merge`, { fromOrderId }),
    onSuccess: () => {
      toast.success(t('waiter.merged'));
      qc.invalidateQueries({ queryKey: ['waiter-order', activeOrderId] });
      refreshTablesAndOrders();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const splitMut = useMutation({
    mutationFn: () => api.post(`/sales/orders/${activeOrderId}/split`, { itemIds: splitSel }),
    onSuccess: () => {
      toast.success(t('waiter.splitDone'));
      setSplitMode(false);
      setSplitSel([]);
      qc.invalidateQueries({ queryKey: ['waiter-order', activeOrderId] });
      refreshTablesAndOrders();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const orderTotal = useMemo(
    () => (order?.items || []).reduce((s: number, it: any) => s + (it.unitPrice ?? 0) * (it.quantity ?? 0), 0),
    [order],
  );

  // Seed "already sent" items once per opened order so a resumed bill doesn't
  // reprint its existing lines; a fresh ticket starts empty.
  useEffect(() => {
    if (order?.id && seededOrderRef.current !== order.id) {
      seededOrderRef.current = order.id;
      setSentItemIds(new Set((order.items || []).map((it: any) => it.id)));
    }
  }, [order?.id, order?.items]);

  const newItems = useMemo(
    () => (order?.items || []).filter((it: any) => !sentItemIds.has(it.id)),
    [order, sentItemIds],
  );

  const sendToKitchen = () => {
    if (!order) return;
    if (!newItems.length) {
      toast(t('waiter.nothingNew'));
      return;
    }
    printKot(order, { items: newItems, waiter: waiterName, splitByStation: true });
    setSentItemIds((prev) => {
      const next = new Set(prev);
      newItems.forEach((it: any) => next.add(it.id));
      return next;
    });
    toast.success(t('waiter.sentToKitchen'));
  };

  if (!branchId) {
    return (
      <div>
        <PageHeader title={t('nav.waiter')} />
        <p className="text-sm text-amber-600">{t('waiter.selectBranch')}</p>
      </div>
    );
  }

  // ============ FLOOR PLAN ============
  if (!selectedTable) {
    return (
      <div>
        <PageHeader title={t('nav.waiter')} subtitle={activeBranch?.name} />
        <div className="flex flex-wrap gap-3 mb-4 text-xs text-gray-500">
          {['AVAILABLE', 'OCCUPIED', 'BILL_REQUESTED', 'RESERVED'].map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${statusDot[s]}`} />
              {s.replace('_', ' ')}
            </span>
          ))}
        </div>
        {tablesLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {(tables || []).filter((tb: TableRow) => tb.isActive).map((table: TableRow) => {
              const ord = orderForTable(table.name);
              return (
                <button
                  key={table.id}
                  onClick={() => openTable.mutate(table)}
                  disabled={openTable.isPending}
                  className={`aspect-square rounded-2xl border-2 p-3 flex flex-col items-center justify-center text-center transition hover:shadow-md disabled:opacity-60 ${statusTone[table.status] || 'border-gray-300 bg-white dark:bg-gray-900'}`}
                >
                  <span className={`w-3 h-3 rounded-full mb-1 ${statusDot[table.status] || 'bg-gray-400'}`} />
                  <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{table.name}</span>
                  <span className="text-[11px] text-gray-500">{table.seats} {t('waiter.seats')}</span>
                  {ord && (
                    <span className="mt-1 text-[11px] font-medium text-gray-700 dark:text-gray-300">
                      {ord.status === 'HELD' ? `⏸ ${t('waiter.held')}` : `#${ord.orderNo.slice(-4)}`}
                    </span>
                  )}
                </button>
              );
            })}
            {!tables?.length && <p className="text-sm text-gray-400 col-span-full">{t('waiter.noTables')}</p>}
          </div>
        )}
      </div>
    );
  }

  // ============ ORDER VIEW ============
  return (
    <div>
      <PageHeader title={`${t('waiter.table')} ${selectedTable.name}`} subtitle={order?.orderNo} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Menu grid */}
        <div className="lg:col-span-2">
          <div className="flex flex-wrap gap-2 mb-3">
            <button onClick={backToFloor} className="px-3 py-2 rounded-lg text-sm bg-gray-100 dark:bg-gray-800">
              ← {t('waiter.floor')}
            </button>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('waiter.searchProducts')}
              className="flex-1 min-w-[160px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            />
            <button
              onClick={() => setCategoryId(undefined)}
              className={`px-3 py-2 rounded-lg text-sm ${!categoryId ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-800'}`}
            >
              {t('waiter.all')}
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
          {productsLoading ? (
            <LoadingSpinner />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {(products || []).map((p: any) => {
                const qty = stockMap.get(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => addItem.mutate(p)}
                    disabled={addItem.isPending}
                    className="text-left rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden hover:border-primary hover:shadow-sm transition disabled:opacity-60"
                  >
                    <div className="h-20 bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl">🍽️</span>
                      )}
                    </div>
                    <div className="p-2">
                      <div className="font-medium text-sm text-gray-900 dark:text-gray-100 line-clamp-2">{p.name}</div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-500">{p.sku}</span>
                        {qty !== undefined && (
                          <span className={`text-[11px] font-medium ${qty <= 0 ? 'text-red-600' : 'text-gray-500'}`}>
                            {t('waiter.stock')}: {qty}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              {!products?.length && <p className="text-sm text-gray-500 col-span-full">{t('waiter.noProducts')}</p>}
            </div>
          )}
        </div>

        {/* Order ticket */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex flex-col">
          <h3 className="text-sm font-semibold mb-3">{t('waiter.ticket')}</h3>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 -mx-1 min-h-[8rem]">
            {orderLoading ? (
              <LoadingSpinner />
            ) : (
              (order?.items || []).map((it: any) => (
                <div key={it.id} className="px-1 py-2 flex justify-between items-center gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {splitMode && (
                      <input
                        type="checkbox"
                        checked={splitSel.includes(it.id)}
                        onChange={(e) =>
                          setSplitSel((prev) => (e.target.checked ? [...prev, it.id] : prev.filter((x) => x !== it.id)))
                        }
                        className="rounded border-gray-300 flex-shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {it.product?.name ?? `#${it.productId}`}
                      </div>
                      <div className="text-xs text-gray-500">
                        {it.quantity} × {Number(it.unitPrice).toFixed(2)}
                        <span className="ms-2 text-[10px] uppercase tracking-wide text-gray-400">{it.kdsStatus}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{(it.unitPrice * it.quantity).toFixed(2)}</span>
                    {!splitMode && (
                      <button onClick={() => removeItem.mutate(it.id)} className="text-red-600 text-sm" aria-label="Remove">✕</button>
                    )}
                  </div>
                </div>
              ))
            )}
            {!orderLoading && !order?.items?.length && (
              <p className="text-sm text-gray-400 py-8 text-center">{t('waiter.tapToAdd')}</p>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-800 mt-3 pt-3">
            <div className="flex justify-between text-lg font-bold mb-3">
              <span>{t('waiter.total')}</span>
              <span>{orderTotal.toFixed(2)}</span>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">{t('waiter.kdsNote')}</p>

            {/* Table & bill operations */}
            <div className="grid grid-cols-2 gap-2 mb-2">
              <select
                onChange={(e) => { if (e.target.value) transferMut.mutate(e.target.value); e.currentTarget.selectedIndex = 0; }}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-xs"
              >
                <option value="">↪ {t('waiter.transferTo')}</option>
                {otherTables.map((tb: TableRow) => <option key={tb.id} value={tb.name}>{tb.name}</option>)}
              </select>
              <select
                onChange={(e) => { if (e.target.value) mergeMut.mutate(parseInt(e.target.value, 10)); e.currentTarget.selectedIndex = 0; }}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-xs"
              >
                <option value="">⇄ {t('waiter.mergeFrom')}</option>
                {mergeableOrders.map((o) => <option key={o.id} value={o.id}>{o.tableName}</option>)}
              </select>
            </div>
            {splitMode ? (
              <div className="flex gap-2 mb-2">
                <button onClick={() => splitMut.mutate()} disabled={!splitSel.length || splitMut.isPending} className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium disabled:opacity-50">
                  {t('waiter.splitConfirm')} ({splitSel.length})
                </button>
                <button onClick={() => { setSplitMode(false); setSplitSel([]); }} className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs">
                  {t('common.cancel')}
                </button>
              </div>
            ) : (
              <button onClick={() => setSplitMode(true)} disabled={(order?.items?.length ?? 0) < 2} className="w-full mb-2 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs disabled:opacity-50">
                ✂ {t('waiter.splitBill')}
              </button>
            )}

            <button
              onClick={sendToKitchen}
              disabled={!newItems.length}
              className="w-full mb-2 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              🍳 {t('waiter.sendToKitchen')}
              {newItems.length > 0 && (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-white/25 text-xs">
                  {newItems.length}
                </span>
              )}
            </button>
            <button
              onClick={() => order && printKot(order, { waiter: waiterName, splitByStation: true })}
              disabled={!order?.items?.length}
              className="w-full mb-2 py-2 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              🖨 {t('waiter.printKot')}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => holdOrder.mutate()}
                disabled={holdOrder.isPending}
                className="py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-medium disabled:opacity-50"
              >
                {t('waiter.hold')}
              </button>
              <button
                onClick={() => requestBill.mutate()}
                disabled={requestBill.isPending || !order?.items?.length}
                className="py-2.5 rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-50"
              >
                {t('waiter.requestBill')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
