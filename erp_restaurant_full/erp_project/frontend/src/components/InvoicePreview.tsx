import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

/**
 * WYSIWYG invoice/bill preview. Renders the SAME fields the PDF
 * (PurchaseOrderPDF) uses, from the SAME invoice settings object, so admins see
 * exactly what will print and export. Keep this in sync with PurchaseOrderPDF.
 */
const LABELS: Record<string, Record<string, string>> = {
  en: { doc: 'PURCHASE ORDER', supplier: 'Supplier', date: 'Date', item: 'Item', qty: 'Qty', price: 'Unit Price', total: 'Total', subtotal: 'Subtotal', tax: 'Tax', grand: 'Grand Total', terms: 'Terms & Conditions' },
  ar: { doc: 'أمر شراء', supplier: 'المورّد', date: 'التاريخ', item: 'الصنف', qty: 'الكمية', price: 'سعر الوحدة', total: 'الإجمالي', subtotal: 'المجموع الفرعي', tax: 'الضريبة', grand: 'الإجمالي الكلي', terms: 'الشروط والأحكام' },
};

export default function InvoicePreview({ settings }: { settings: Record<string, string> }) {
  const { data: general } = useQuery({
    queryKey: ['settings', 'general+branding'],
    queryFn: () => api.get('/settings').then(r => r.data.data),
    staleTime: 60_000,
  });
  const map: Record<string, string> = {};
  general?.forEach((s: any) => { map[s.key] = s.value; });

  const accent = (settings.invoice_accent_color || '#1e3a5f').trim();
  const lang = settings.invoice_language || 'en';
  const isAr = lang === 'ar';
  const bilingual = lang === 'bilingual';
  const L = LABELS[isAr ? 'ar' : 'en'];
  const La = LABELS.ar;
  const showLogo = settings.invoice_show_logo !== 'false';
  const taxRate = parseFloat(settings.invoice_tax_rate || '0') || 0;
  const currency = settings.invoice_currency || 'QAR';
  const paper = settings.invoice_paper_size === 'LETTER' ? 'LETTER' : 'A4';
  const companyName = (isAr && map.company_name_ar) ? map.company_name_ar : (map.company_name || 'Your Company');

  const sample = [
    { name: isAr ? 'طماطم طازجة' : 'Fresh Tomatoes', qty: 20, price: 4.5 },
    { name: isAr ? 'زيت زيتون' : 'Olive Oil 5L', qty: 6, price: 38 },
  ];
  const subtotal = sample.reduce((s, i) => s + i.qty * i.price, 0);
  const tax = subtotal * (taxRate / 100);
  const grand = subtotal + tax;
  const money = (n: number) => `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const t2 = (en: string, ar: string) => bilingual ? `${en} / ${ar}` : (isAr ? ar : en);

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-100 p-4">
      <div className="text-xs text-gray-500 mb-2 flex items-center justify-between">
        <span>Live preview — matches print &amp; PDF export</span>
        <span className="font-mono">{paper}</span>
      </div>
      <div dir={isAr ? 'rtl' : 'ltr'}
        className="bg-white mx-auto shadow-sm text-[11px] text-gray-800"
        style={{ width: '100%', maxWidth: 520, padding: 20 }}>
        {/* Header banner */}
        {settings.invoice_header_text && (
          <div className="text-center text-white text-[10px] py-1 mb-3 rounded" style={{ background: accent }}>
            {settings.invoice_header_text}
          </div>
        )}
        {/* Company + title */}
        <div className="flex items-start justify-between pb-3 mb-3" style={{ borderBottom: `2px solid ${accent}` }}>
          <div className="flex items-center gap-2">
            {showLogo && map.company_logo && <img src={map.company_logo} alt="logo" className="h-10 w-auto" />}
            <div>
              <div className="font-bold text-sm">{companyName}</div>
              {map.company_tax_id && <div className="text-[10px] text-gray-500">TAX: {map.company_tax_id}</div>}
            </div>
          </div>
          <div className="text-end">
            <div className="font-bold" style={{ color: accent }}>{t2('PURCHASE ORDER', La.doc)}</div>
            <div className="text-[10px] text-gray-500">PO-2026-0001</div>
          </div>
        </div>
        {/* Meta */}
        <div className="flex justify-between mb-3 text-[10px]">
          <div><span className="text-gray-500">{t2('Supplier', La.supplier)}:</span> Gulf Foods Co.</div>
          <div><span className="text-gray-500">{t2('Date', La.date)}:</span> 20 Jun 2026</div>
        </div>
        {/* Items table */}
        <table className="w-full border-collapse mb-3">
          <thead>
            <tr style={{ background: accent, color: '#fff' }}>
              <th className="text-start px-2 py-1 font-semibold">{t2('Item', La.item)}</th>
              <th className="text-end px-2 py-1 font-semibold">{t2('Qty', La.qty)}</th>
              <th className="text-end px-2 py-1 font-semibold">{t2('Unit Price', La.price)}</th>
              <th className="text-end px-2 py-1 font-semibold">{t2('Total', La.total)}</th>
            </tr>
          </thead>
          <tbody>
            {sample.map((i, idx) => (
              <tr key={idx} className="border-b border-gray-100">
                <td className="px-2 py-1">{i.name}</td>
                <td className="px-2 py-1 text-end">{i.qty}</td>
                <td className="px-2 py-1 text-end">{money(i.price)}</td>
                <td className="px-2 py-1 text-end">{money(i.qty * i.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Totals */}
        <div className="flex justify-end mb-3">
          <div className="w-48 text-[10px] space-y-0.5">
            <div className="flex justify-between"><span className="text-gray-500">{t2('Subtotal', La.subtotal)}</span><span>{money(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">{t2('Tax', La.tax)} ({taxRate}%)</span><span>{money(tax)}</span></div>
            <div className="flex justify-between font-bold pt-1" style={{ color: accent, borderTop: `1px solid ${accent}` }}>
              <span>{t2('Grand Total', La.grand)}</span><span>{money(grand)}</span>
            </div>
          </div>
        </div>
        {/* Terms */}
        {settings.invoice_terms && (
          <div className="mb-4 text-[10px]">
            <div className="font-semibold" style={{ color: accent }}>{t2('Terms & Conditions', La.terms)}</div>
            <div className="text-gray-600 whitespace-pre-line">{settings.invoice_terms}</div>
          </div>
        )}
        {/* Signatures */}
        <div className="flex justify-between gap-3 mt-6 text-[10px] text-center">
          {[settings.invoice_sig_prepared || 'Prepared By', settings.invoice_sig_approved || 'Approved By', settings.invoice_sig_ack || 'Supplier Acknowledgment'].map((s, i) => (
            <div key={i} className="flex-1">
              <div style={{ borderTop: `1px solid ${accent}` }} className="pt-1 text-gray-600">{s}</div>
            </div>
          ))}
        </div>
        {/* Footer */}
        <div className="mt-4 pt-2 border-t border-gray-100 text-[9px] text-gray-400 text-center">
          {settings.invoice_footer_text || `${companyName} · PO-2026-0001`}
        </div>
      </div>
    </div>
  );
}
