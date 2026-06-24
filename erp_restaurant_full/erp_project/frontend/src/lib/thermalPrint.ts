/**
 * Thermal printing helpers.
 *
 * Browsers can't talk to an ESC/POS printer directly, so we render an 80mm
 * (configurable) print layout into a hidden iframe and invoke the OS print
 * dialog. Any thermal printer installed on the machine (set as default, with
 * margins disabled) will then produce a real receipt / kitchen ticket.
 */

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const money = (v: unknown): string => Number(v ?? 0).toFixed(2);

interface CategoryLike {
  id?: number;
  name?: string;
  nameAr?: string;
  station?: string | null;
}
interface OrderItemLike {
  productId: number;
  quantity: number;
  unitPrice: number;
  notes?: string | null;
  modifiers?: { name?: string }[] | null;
  product?: { name?: string; nameAr?: string; category?: CategoryLike | null } | null;
}
interface PaymentLike {
  method: string;
  amount: number;
}
interface OrderLike {
  orderNo: string;
  tableName?: string | null;
  channel?: string;
  subtotal?: number;
  couponCode?: string | null;
  couponDiscount?: number;
  discountTotal?: number;
  total?: number;
  paidTotal?: number;
  createdAt?: string;
  completedAt?: string | null;
  items?: OrderItemLike[];
  payments?: PaymentLike[];
}

export interface BusinessInfo {
  businessName?: string;
  branchName?: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  taxId?: string;
}

/** Map a line item to a kitchen station from its product category. */
export function stationForItem(it: OrderItemLike): string {
  // Prefer the explicit per-category station set in Settings/Categories.
  const explicit = it.product?.category?.station;
  if (explicit && explicit.trim()) return explicit.trim().toUpperCase();
  const cat = (it.product?.category?.name || '').toLowerCase();
  if (/pastry|bakery|dessert|cake|sweet|pie|croissant|معجن|حلو|مخبوز|كيك/.test(cat)) return 'PASTRY / BAKERY';
  if (/coffee|drink|beverage|juice|\bbar\b|tea|smoothie|soda|قهوة|مشروب|عصير|شاي/.test(cat)) return 'BAR / DRINKS';
  return 'HOT KITCHEN';
}

const BASE_CSS = (widthMm: number) => `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { width: ${widthMm}mm; font-family: 'Courier New', ui-monospace, monospace; color: #000; }
  .r { padding: 4mm 3mm; }
  .c { text-align: center; }
  .b { font-weight: 700; }
  .lg { font-size: 15px; }
  .xl { font-size: 18px; }
  .sm { font-size: 11px; }
  .muted { color: #333; }
  .logo { max-width: 60%; max-height: 80px; margin: 0 auto 4px; display: block; }
  .hr { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; line-height: 1.4; }
  .row > span:last-child { white-space: nowrap; }
  .krow { display: flex; gap: 8px; font-size: 16px; font-weight: 700; line-height: 1.5; }
  .krow .qty { min-width: 28px; }
  .brk { page-break-after: always; }
  @page { size: ${widthMm}mm auto; margin: 0; }
  @media print { html, body { width: ${widthMm}mm; } }
`;

function printDoc(title: string, bodyHtml: string, widthMm = 80) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${BASE_CSS(widthMm)}</style></head><body>${bodyHtml}</body></html>`;
  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    document.body.removeChild(iframe);
    return;
  }
  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    setTimeout(() => iframe.parentNode && document.body.removeChild(iframe), 500);
  };
  win.onafterprint = cleanup;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch {
      /* ignore */
    }
    cleanup();
  }, 350); // small delay lets the logo image load before printing
  setTimeout(cleanup, 60_000); // safety net
}

/** Customer receipt (logo, business info, prices, payments, change). */
export function printReceipt(order: OrderLike, info: BusinessInfo = {}) {
  const items = order.items ?? [];
  const subtotal = order.subtotal ?? items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const discount = order.couponDiscount ?? 0;
  const total = order.total ?? Math.max(0, subtotal - discount);
  const paid = order.paidTotal ?? (order.payments ?? []).reduce((s, p) => s + p.amount, 0);
  const change = Math.max(0, +(paid - total).toFixed(2));
  const when = new Date(order.completedAt || order.createdAt || Date.now()).toLocaleString();

  const itemRows = items
    .map(
      (it) => `
      <div class="row"><span>${it.quantity} x ${esc(it.product?.name ?? `#${it.productId}`)}</span><span>${money(it.unitPrice * it.quantity)}</span></div>
      ${it.modifiers && it.modifiers.length ? `<div class="row sm muted"><span>+ ${esc(it.modifiers.map((m) => m.name).filter(Boolean).join(', '))}</span><span></span></div>` : ''}
      <div class="row sm muted"><span>@ ${money(it.unitPrice)}</span><span></span></div>`,
    )
    .join('');

  const payRows = (order.payments ?? [])
    .map((p) => `<div class="row"><span>${esc(p.method.replace('_', ' '))}</span><span>${money(p.amount)}</span></div>`)
    .join('');

  const body = `
    <div class="r">
      ${info.logoUrl ? `<img class="logo" src="${esc(info.logoUrl)}" alt="logo" />` : ''}
      <div class="c b lg">${esc(info.businessName || 'GWK Restaurant')}</div>
      ${info.branchName ? `<div class="c sm">${esc(info.branchName)}</div>` : ''}
      ${info.address ? `<div class="c sm">${esc(info.address)}</div>` : ''}
      ${info.phone ? `<div class="c sm">${esc(info.phone)}</div>` : ''}
      ${info.taxId ? `<div class="c sm">Tax ID: ${esc(info.taxId)}</div>` : ''}
      <div class="c sm">${esc(when)}</div>
      <div class="hr"></div>
      <div class="row"><span>Order</span><span>${esc(order.orderNo)}</span></div>
      ${order.tableName ? `<div class="row"><span>Table</span><span>${esc(order.tableName)}</span></div>` : ''}
      ${order.channel ? `<div class="row"><span>Type</span><span>${esc(order.channel.replace('_', ' '))}</span></div>` : ''}
      <div class="hr"></div>
      ${itemRows}
      <div class="hr"></div>
      <div class="row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
      ${discount > 0 ? `<div class="row"><span>Discount${order.couponCode ? ` (${esc(order.couponCode)})` : ''}</span><span>-${money(discount)}</span></div>` : ''}
      <div class="row b lg"><span>TOTAL</span><span>${money(total)}</span></div>
      <div class="hr"></div>
      ${payRows}
      ${change > 0 ? `<div class="row"><span>Change</span><span>${money(change)}</span></div>` : ''}
      <div class="hr"></div>
      <div class="c sm">Thank you & see you again!</div>
    </div>`;
  printDoc(`Receipt ${order.orderNo}`, body);
}

function kotSection(order: OrderLike, items: OrderItemLike[], opts: { station?: string; waiter?: string }) {
  const when = new Date().toLocaleTimeString();
  const rows = items
    .map(
      (it) => `
      <div class="krow"><span class="qty">${it.quantity}x</span><span>${esc(it.product?.name ?? `#${it.productId}`)}</span></div>
      ${it.modifiers && it.modifiers.length ? `<div class="sm muted">→ ${esc(it.modifiers.map((m) => m.name).filter(Boolean).join(', '))}</div>` : ''}
      ${it.notes ? `<div class="sm muted">* ${esc(it.notes)}</div>` : ''}`,
    )
    .join('');
  return `
    <div class="r">
      <div class="c b xl">KITCHEN ORDER</div>
      ${opts.station ? `<div class="c b lg">${esc(opts.station)}</div>` : ''}
      ${order.tableName ? `<div class="c b lg">Table ${esc(order.tableName)}</div>` : ''}
      <div class="c sm">${esc(order.orderNo)} &middot; ${esc(when)}</div>
      ${opts.waiter ? `<div class="c sm">Waiter: ${esc(opts.waiter)}</div>` : ''}
      <div class="hr"></div>
      ${rows || '<div class="c sm">No items</div>'}
      <div class="hr"></div>
      <div class="c sm">${items.reduce((s, i) => s + i.quantity, 0)} item(s)</div>
    </div>`;
}

/**
 * Kitchen Order Ticket. With `splitByStation`, items are grouped by station
 * (Hot Kitchen / Pastry / Bar) and each station prints as its own ticket
 * (separated by a page break so an auto-cutter slices between them).
 */
export function printKot(
  order: OrderLike,
  opts: { station?: string; items?: OrderItemLike[]; waiter?: string; splitByStation?: boolean } = {},
) {
  const items = opts.items ?? order.items ?? [];
  if (!items.length) return;

  if (opts.splitByStation) {
    const groups = new Map<string, OrderItemLike[]>();
    for (const it of items) {
      const st = stationForItem(it);
      if (!groups.has(st)) groups.set(st, []);
      groups.get(st)!.push(it);
    }
    const entries = [...groups.entries()];
    const body = entries
      .map(([station, its], i) => kotSection(order, its, { station, waiter: opts.waiter }) + (i < entries.length - 1 ? '<div class="brk"></div>' : ''))
      .join('');
    printDoc(`KOT ${order.orderNo}`, body);
    return;
  }

  printDoc(`KOT ${order.orderNo}`, kotSection(order, items, { station: opts.station, waiter: opts.waiter }));
}

/** Statement of account for a customer: outstanding invoices + total owed. */
export function printCustomerStatement(
  info: BusinessInfo,
  customer: { name?: string; phone?: string },
  rows: Array<{ orderNo: string; outstanding: number; ageDays: number; total?: number; paid?: number; completedAt?: string | null }>,
) {
  const total = rows.reduce((s, r) => s + (r.outstanding || 0), 0);
  const lines = rows
    .map(
      (r) => `
      <div class="row"><span>${esc(r.orderNo)}</span><span>${money(r.outstanding)}</span></div>
      <div class="row sm muted"><span>${r.completedAt ? esc(new Date(r.completedAt).toLocaleDateString()) : ''} &middot; ${r.ageDays}d</span><span></span></div>`,
    )
    .join('');
  const body = `
    <div class="r">
      ${info.logoUrl ? `<img class="logo" src="${esc(info.logoUrl)}" alt="logo" />` : ''}
      <div class="c b lg">${esc(info.businessName || 'GWK Restaurant')}</div>
      ${info.branchName ? `<div class="c sm">${esc(info.branchName)}</div>` : ''}
      <div class="c b">STATEMENT OF ACCOUNT</div>
      <div class="c sm">${esc(new Date().toLocaleString())}</div>
      <div class="hr"></div>
      <div class="row"><span>Customer</span><span>${esc(customer.name || '')}</span></div>
      ${customer.phone ? `<div class="row"><span>Phone</span><span>${esc(customer.phone)}</span></div>` : ''}
      <div class="hr"></div>
      <div class="c sm b">OUTSTANDING INVOICES</div>
      ${lines || '<div class="c sm">None</div>'}
      <div class="hr"></div>
      <div class="row b lg"><span>TOTAL DUE</span><span>${money(total)}</span></div>
      <div class="hr"></div>
      <div class="c sm">Thank you for your business.</div>
    </div>`;
  printDoc(`Statement ${customer.name ?? ''}`, body);
}
export function printSessionReport(rep: any, info: BusinessInfo = {}) {
  const s = rep.session ?? {};
  const methods = Object.entries(rep.paymentsByMethod ?? {}) as [string, number][];
  const methodRows = methods
    .map(([m, amt]) => `<div class="row"><span>${esc(m.replace('_', ' '))}</span><span>${money(amt)}</span></div>`)
    .join('');
  const isClosed = s.status === 'CLOSED';
  const body = `
    <div class="r">
      ${info.logoUrl ? `<img class="logo" src="${esc(info.logoUrl)}" alt="logo" />` : ''}
      <div class="c b lg">${esc(info.businessName || 'GWK Restaurant')}</div>
      ${info.branchName ? `<div class="c sm">${esc(info.branchName)}</div>` : ''}
      <div class="c b">${isClosed ? 'Z-REPORT (SESSION CLOSE)' : 'X-REPORT (MID-SHIFT)'}</div>
      <div class="c sm">${esc(s.sessionNo ?? '')}</div>
      <div class="c sm">${esc(new Date(s.openedAt || Date.now()).toLocaleString())}${isClosed && s.closedAt ? ' → ' + esc(new Date(s.closedAt).toLocaleString()) : ''}</div>
      <div class="hr"></div>
      <div class="row"><span>Orders</span><span>${rep.orderCount ?? 0}</span></div>
      <div class="row b"><span>Sales total</span><span>${money(rep.salesTotal)}</span></div>
      <div class="hr"></div>
      <div class="c sm b">PAYMENTS BY METHOD</div>
      ${methodRows || '<div class="row sm"><span>—</span><span>0.00</span></div>'}
      <div class="hr"></div>
      <div class="c sm b">CASH DRAWER</div>
      <div class="row"><span>Opening float</span><span>${money(s.openingFloat)}</span></div>
      <div class="row"><span>Cash sales</span><span>${money(rep.cashSales)}</span></div>
      <div class="row"><span>Cash in</span><span>${money(rep.cashIn)}</span></div>
      <div class="row"><span>Cash out</span><span>-${money(rep.cashOut)}</span></div>
      <div class="row b"><span>Expected cash</span><span>${money(rep.expectedCash)}</span></div>
      ${rep.closingCounted != null ? `<div class="row"><span>Counted cash</span><span>${money(rep.closingCounted)}</span></div>` : ''}
      ${rep.cashDifference != null ? `<div class="row b"><span>Difference</span><span>${money(rep.cashDifference)}</span></div>` : ''}
      <div class="hr"></div>
      <div class="row"><span>Food cost</span><span>${money(rep.foodCost)}</span></div>
      <div class="row b"><span>Gross profit</span><span>${money(rep.grossProfit)}</span></div>
      <div class="hr"></div>
      <div class="c sm">Generated ${esc(new Date().toLocaleString())}</div>
    </div>`;
  printDoc(`Session ${s.sessionNo ?? ''}`, body);
}
