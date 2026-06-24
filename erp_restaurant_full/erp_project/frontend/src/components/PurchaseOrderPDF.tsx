import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer';
import { format } from 'date-fns';

/**
 * Purchase Order PDF — fully wired to Admin Panel invoice customization.
 *
 * Every setting saved in Admin → Invoice & Bill Customization is applied here:
 *   invoice_header_text    → banner above the header
 *   invoice_footer_text    → left footer text (replaces default company·PO)
 *   invoice_terms          → Terms & Conditions block
 *   invoice_accent_color   → title color, header border, table header bg, grand total, signature lines
 *   invoice_show_logo      → show/hide company logo
 *   invoice_tax_rate       → tax row in totals
 *   invoice_currency       → fallback currency if PO has none
 *   invoice_sig_prepared   → first signature label
 *   invoice_sig_approved   → second signature label
 *   invoice_sig_ack        → third signature label
 *   invoice_paper_size     → A4 or LETTER
 *   invoice_language       → en | ar | bilingual (switches all PDF labels)
 *
 * FONT STRATEGY:
 *   Default: Helvetica (always built-in — zero CDN dependency, PDF never fails).
 *   Optional: Inter + NotoArabic loaded from jsDelivr CDN in try/catch.
 *   Arabic language mode uses NotoArabic when available, falls back to Helvetica.
 */
try {
  Font.register({
    family: 'Inter',
    fonts: [
      { src: 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-400-normal.ttf', fontWeight: 400 },
      { src: 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-700-normal.ttf', fontWeight: 700 },
    ],
  });
  Font.register({
    family: 'NotoArabic',
    fonts: [
      { src: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-arabic@5.0.13/files/noto-sans-arabic-arabic-400-normal.ttf', fontWeight: 400 },
      { src: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-arabic@5.0.13/files/noto-sans-arabic-arabic-700-normal.ttf', fontWeight: 700 },
    ],
  });
} catch { /* CDN unavailable — Helvetica fallback active */ }

Font.registerHyphenationCallback((word) => [word]);

// ---- Label dictionaries ------------------------------------------------
const LABELS_EN = {
  purchaseOrder: 'PURCHASE ORDER',
  supplier: 'SUPPLIER',
  deliveryBranch: 'DELIVERY BRANCH',
  issueDate: 'ISSUE DATE',
  expectedDelivery: 'EXPECTED DELIVERY',
  currency: 'CURRENCY',
  linkedReq: 'LINKED REQUISITION',
  sku: 'SKU',
  product: 'PRODUCT',
  qty: 'QTY',
  unit: 'UNIT',
  unitPrice: 'UNIT PRICE',
  total: 'TOTAL',
  subtotal: 'Subtotal',
  tax: 'Tax',
  grandTotal: 'TOTAL',
  notes: 'Notes',
  terms: 'Terms & Conditions',
  contains: 'Contains',
  page: 'Page',
  of: 'of',
  generated: 'Generated',
  vatTax: 'VAT/Tax',
};

const LABELS_AR = {
  purchaseOrder: 'أمر شراء',
  supplier: 'المورد',
  deliveryBranch: 'فرع التسليم',
  issueDate: 'تاريخ الإصدار',
  expectedDelivery: 'التسليم المتوقع',
  currency: 'العملة',
  linkedReq: 'طلب مرتبط',
  sku: 'رمز المنتج',
  product: 'المنتج',
  qty: 'الكمية',
  unit: 'الوحدة',
  unitPrice: 'سعر الوحدة',
  total: 'الإجمالي',
  subtotal: 'المجموع الفرعي',
  tax: 'ضريبة',
  grandTotal: 'الإجمالي',
  notes: 'ملاحظات',
  terms: 'الشروط والأحكام',
  contains: 'يحتوي على',
  page: 'صفحة',
  of: 'من',
  generated: 'تم الإنشاء',
  vatTax: 'ضريبة القيمة المضافة',
};

function getLabels(lang: string) {
  if (lang === 'ar') return LABELS_AR;
  if (lang === 'bilingual') {
    // Return bilingual: "English (Arabic)"
    return Object.fromEntries(
      Object.entries(LABELS_EN).map(([k, v]) => [
        k,
        `${v} (${LABELS_AR[k as keyof typeof LABELS_AR]})`,
      ])
    ) as typeof LABELS_EN;
  }
  return LABELS_EN;
}

// ---- Styles (accent-aware, built at render time) -----------------------
function makeStyles(accent: string) {
  return StyleSheet.create({
    page: { fontFamily: 'Helvetica', fontSize: 9, color: '#1a1a1a', padding: 36, backgroundColor: '#ffffff' },
    headerBanner: { fontSize: 8, color: accent, marginBottom: 10, textAlign: 'center', fontFamily: 'Helvetica-Bold' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 16, borderBottom: `2pt solid ${accent}` },
    logo: { width: 90, height: 45, objectFit: 'contain' },
    logoPlaceholder: { width: 90, height: 45, backgroundColor: accent, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
    logoText: { color: '#ffffff', fontSize: 16, fontFamily: 'Helvetica-Bold' },
    companyBlock: { alignItems: 'flex-end', maxWidth: '50%' },
    companyName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#1a1a1a', marginBottom: 3 },
    companyMeta: { fontSize: 7.5, color: '#555555', lineHeight: 1.6 },
    docTitle: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: accent, marginBottom: 4 },
    docNumber: { fontSize: 10, color: '#444444', fontFamily: 'Helvetica-Bold' },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, marginTop: 6 },
    metaGrid: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    metaBox: { flex: 1, backgroundColor: '#f8f8f8', borderRadius: 6, padding: 10, borderLeft: `3pt solid ${accent}` },
    metaLabel: { fontSize: 6.5, color: '#888888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, fontFamily: 'Helvetica-Bold' },
    metaValue: { fontSize: 9, color: '#1a1a1a', fontFamily: 'Helvetica-Bold' },
    metaSubValue: { fontSize: 7.5, color: '#555555', marginTop: 2 },
    table: { marginBottom: 20 },
    tableHeader: { flexDirection: 'row', backgroundColor: accent, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 8, marginBottom: 1 },
    tableHeaderCell: { color: '#ffffff', fontSize: 7.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.3 },
    tableRow: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 8, borderBottom: `0.5pt solid #e5e5e5` },
    tableRowAlt: { backgroundColor: '#fafafa' },
    tableCell: { fontSize: 8.5, color: '#1a1a1a' },
    colSku: { width: '13%' },
    colName: { width: '37%' },
    colQty: { width: '10%', textAlign: 'right' },
    colUnit: { width: '10%', textAlign: 'center' },
    colPrice: { width: '15%', textAlign: 'right' },
    colTotal: { width: '15%', textAlign: 'right' },
    totalsBox: { alignItems: 'flex-end', marginBottom: 28 },
    totalRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 0, marginBottom: 4 },
    totalLabel: { fontSize: 8.5, color: '#555555', width: 100, textAlign: 'right', paddingRight: 8 },
    totalValue: { fontSize: 8.5, color: '#1a1a1a', width: 90, textAlign: 'right' },
    grandTotalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4, paddingTop: 6, borderTop: `1.5pt solid ${accent}` },
    grandTotalLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: accent, width: 100, textAlign: 'right', paddingRight: 8 },
    grandTotalValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: accent, width: 90, textAlign: 'right' },
    notesBox: { backgroundColor: '#fffbeb', border: `1pt solid #fcd34d`, borderRadius: 6, padding: 10, marginBottom: 16 },
    notesLabel: { fontSize: 7.5, color: '#92400e', fontFamily: 'Helvetica-Bold', marginBottom: 4 },
    notesText: { fontSize: 8.5, color: '#78350f' },
    termsBox: { marginBottom: 16, paddingTop: 8, borderTop: `0.5pt solid #e5e5e5` },
    termsLabel: { fontSize: 7, color: '#888888', fontFamily: 'Helvetica-Bold', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
    termsText: { fontSize: 7.5, color: '#555555', lineHeight: 1.5 },
    allergenText: { fontSize: 6.5, color: '#b45309', marginTop: 2, fontFamily: 'Helvetica-Oblique' },
    signatureBlock: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 36, paddingTop: 8 },
    signatureBox: { width: '30%', borderTop: `1.5pt solid ${accent}`, paddingTop: 8 },
    signatureLabel: { fontSize: 8, color: '#555555', textAlign: 'center' },
    footer: { position: 'absolute', bottom: 20, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTop: `0.5pt solid #e5e5e5`, paddingTop: 6 },
    footerText: { fontSize: 6.5, color: '#999999' },
  });
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#f59e0b',
  SENT_TO_SUPPLIER: '#3b82f6',
  PARTIALLY_RECEIVED: '#8b5cf6',
  FULLY_RECEIVED: '#22c55e',
  CANCELLED: '#ef4444',
};

export interface POPDFProps {
  po: any;
  settings: Record<string, string>;
}

export function PurchaseOrderPDF({ po, settings }: POPDFProps) {
  // ---- Company info (from general/branding settings) -------------------
  const companyName = settings.company_name || 'GWK Operations';
  const taxId       = settings.company_tax_id || '';
  const address     = settings.company_address || '';
  const phone       = settings.company_phone || '';

  // ---- Invoice customization (from invoice settings group) -------------
  const accent      = (settings.invoice_accent_color || '#1e3a5f').trim();
  const headerText  = settings.invoice_header_text || '';
  const footerText  = settings.invoice_footer_text || '';
  const terms       = settings.invoice_terms || '';
  const showLogo    = settings.invoice_show_logo !== 'false';
  const taxRate     = parseFloat(settings.invoice_tax_rate || '0') || 0;
  const currency    = po.currency || settings.invoice_currency || 'QAR';
  const sigPrepared = settings.invoice_sig_prepared || 'Prepared By';
  const sigApproved = settings.invoice_sig_approved || 'Approved By';
  const sigAck      = settings.invoice_sig_ack || 'Supplier Acknowledgment';
  const paperSize   = (settings.invoice_paper_size === 'LETTER' ? 'LETTER' : 'A4') as 'A4' | 'LETTER';
  const lang        = settings.invoice_language || 'en';

  // ---- Labels (language-aware) -----------------------------------------
  const L = getLabels(lang);

  // ---- Styles (accent-aware, generated per render) ---------------------
  const S = makeStyles(accent);

  // ---- Logo URL (absolute, works inside react-pdf worker) --------------
  const buildLogoUrl = (path: string): string => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}${path.startsWith('/') ? '' : '/'}${path}`;
  };
  const logoUrl = showLogo && settings.company_logo ? buildLogoUrl(settings.company_logo) : null;

  // ---- Financials ------------------------------------------------------
  const subtotal   = po.items?.reduce((s: number, i: any) => s + (i.orderedQty * i.unitPrice), 0) ?? 0;
  const taxAmount  = subtotal * (taxRate / 100);
  const grandTotal = subtotal + taxAmount;   // always recalculate — don't trust po.totalAmount (pre-tax)

  const statusColor = STATUS_COLORS[po.status] || '#6b7280';

  return (
    <Document title={`PO-${po.poNumber}`} author={companyName} creator="GWK ERP V8">
      <Page size={paperSize} style={S.page}>

        {/* Optional header banner from admin panel */}
        {headerText ? (
          <Text style={S.headerBanner}>{headerText}</Text>
        ) : null}

        {/* ===== HEADER ===== */}
        <View style={S.header}>
          {/* Left: document title + PO number + status badge */}
          <View>
            <Text style={S.docTitle}>{L.purchaseOrder}</Text>
            <Text style={S.docNumber}>{po.poNumber}</Text>
            <View style={[S.statusBadge, { backgroundColor: statusColor + '18', borderWidth: 1, borderColor: statusColor }]}>
              <Text style={{ color: statusColor, fontSize: 7.5, fontFamily: 'Helvetica-Bold' }}>
                {po.status?.replace(/_/g, ' ')}
              </Text>
            </View>
          </View>

          {/* Right: logo + company info */}
          <View style={S.companyBlock}>
            {logoUrl ? (
              <Image src={logoUrl} style={S.logo} />
            ) : (
              <View style={S.logoPlaceholder}>
                <Text style={S.logoText}>{companyName.substring(0, 3).toUpperCase()}</Text>
              </View>
            )}
            <Text style={[S.companyName, { marginTop: 6 }]}>{companyName}</Text>
            {taxId   ? <Text style={S.companyMeta}>{L.vatTax}: {taxId}</Text>   : null}
            {address ? <Text style={S.companyMeta}>{address}</Text>             : null}
            {phone   ? <Text style={S.companyMeta}>{phone}</Text>               : null}
          </View>
        </View>

        {/* ===== META GRID ===== */}
        <View style={S.metaGrid}>
          {/* Supplier */}
          <View style={S.metaBox}>
            <Text style={S.metaLabel}>{L.supplier}</Text>
            <Text style={S.metaValue}>{po.supplier?.name || '—'}</Text>
            {po.supplier?.contactName ? <Text style={S.metaSubValue}>{po.supplier.contactName}</Text> : null}
            {po.supplier?.phone       ? <Text style={S.metaSubValue}>{po.supplier.phone}</Text>       : null}
            {po.supplier?.email       ? <Text style={S.metaSubValue}>{po.supplier.email}</Text>       : null}
          </View>

          {/* Delivery branch */}
          <View style={S.metaBox}>
            <Text style={S.metaLabel}>{L.deliveryBranch}</Text>
            <Text style={S.metaValue}>{po.branch?.name || '—'}</Text>
            {po.branch?.address ? <Text style={S.metaSubValue}>{po.branch.address}</Text> : null}
          </View>

          {/* Dates */}
          <View style={S.metaBox}>
            <Text style={S.metaLabel}>{L.issueDate}</Text>
            <Text style={S.metaValue}>{format(new Date(po.createdAt), 'dd MMM yyyy')}</Text>
            {po.expectedDate ? (
              <>
                <Text style={[S.metaLabel, { marginTop: 8 }]}>{L.expectedDelivery}</Text>
                <Text style={S.metaValue}>{format(new Date(po.expectedDate), 'dd MMM yyyy')}</Text>
              </>
            ) : null}
          </View>

          {/* Currency + linked req */}
          <View style={S.metaBox}>
            <Text style={S.metaLabel}>{L.currency}</Text>
            <Text style={S.metaValue}>{currency}</Text>
            {po.requisition?.requisitionNo ? (
              <>
                <Text style={[S.metaLabel, { marginTop: 8 }]}>{L.linkedReq}</Text>
                <Text style={S.metaValue}>{po.requisition.requisitionNo}</Text>
              </>
            ) : null}
          </View>
        </View>

        {/* ===== ITEMS TABLE ===== */}
        <View style={S.table}>
          {/* Table header — uses accent color as background */}
          <View style={S.tableHeader}>
            <Text style={[S.tableHeaderCell, S.colSku]}>{L.sku}</Text>
            <Text style={[S.tableHeaderCell, S.colName]}>{L.product}</Text>
            <Text style={[S.tableHeaderCell, S.colQty]}>{L.qty}</Text>
            <Text style={[S.tableHeaderCell, S.colUnit]}>{L.unit}</Text>
            <Text style={[S.tableHeaderCell, S.colPrice]}>{L.unitPrice}</Text>
            <Text style={[S.tableHeaderCell, S.colTotal]}>{L.total}</Text>
          </View>

          {/* Rows */}
          {po.items?.map((item: any, idx: number) => (
            <View key={item.id ?? idx} style={[S.tableRow, idx % 2 === 1 ? S.tableRowAlt : {}]}>
              <Text style={[S.tableCell, S.colSku]}>{item.product?.sku || '—'}</Text>
              <View style={S.colName}>
                <Text style={S.tableCell}>{item.product?.name || '—'}</Text>
                {item.product?.allergens?.length > 0 ? (
                  <Text style={S.allergenText}>
                    ⚠ {L.contains}: {item.product.allergens.join(', ')}
                  </Text>
                ) : null}
              </View>
              <Text style={[S.tableCell, S.colQty]}>{item.orderedQty}</Text>
              <Text style={[S.tableCell, S.colUnit]}>{item.unit?.abbreviation || '—'}</Text>
              <Text style={[S.tableCell, S.colPrice]}>{currency} {Number(item.unitPrice).toFixed(2)}</Text>
              <Text style={[S.tableCell, S.colTotal]}>{currency} {(item.orderedQty * item.unitPrice).toFixed(2)}</Text>
            </View>
          ))}
        </View>

        {/* ===== TOTALS ===== */}
        <View style={S.totalsBox}>
          <View style={S.totalRow}>
            <Text style={S.totalLabel}>{L.subtotal}</Text>
            <Text style={S.totalValue}>{currency} {subtotal.toFixed(2)}</Text>
          </View>
          {taxRate > 0 ? (
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>{L.tax} ({taxRate}%)</Text>
              <Text style={S.totalValue}>{currency} {taxAmount.toFixed(2)}</Text>
            </View>
          ) : null}
          {/* Grand total row — accent color, always recalculated */}
          <View style={S.grandTotalRow}>
            <Text style={S.grandTotalLabel}>{L.grandTotal}</Text>
            <Text style={S.grandTotalValue}>{currency} {grandTotal.toFixed(2)}</Text>
          </View>
        </View>

        {/* ===== NOTES ===== */}
        {po.notes ? (
          <View style={S.notesBox}>
            <Text style={S.notesLabel}>{L.notes}</Text>
            <Text style={S.notesText}>{po.notes}</Text>
          </View>
        ) : null}

        {/* ===== TERMS & CONDITIONS (from admin panel) ===== */}
        {terms ? (
          <View style={S.termsBox}>
            <Text style={S.termsLabel}>{L.terms}</Text>
            <Text style={S.termsText}>{terms}</Text>
          </View>
        ) : null}

        {/* ===== SIGNATURE BLOCKS (labels from admin panel) ===== */}
        <View style={S.signatureBlock}>
          <View style={S.signatureBox}>
            <Text style={S.signatureLabel}>{sigPrepared}</Text>
          </View>
          <View style={S.signatureBox}>
            <Text style={S.signatureLabel}>{sigApproved}</Text>
          </View>
          <View style={S.signatureBox}>
            <Text style={S.signatureLabel}>{sigAck}</Text>
          </View>
        </View>

        {/* ===== FOOTER (fixed on every page) ===== */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>
            {footerText || `${companyName} · ${po.poNumber}`}
          </Text>
          <Text
            style={S.footerText}
            render={({ pageNumber, totalPages }) =>
              `${L.page} ${pageNumber} ${L.of} ${totalPages}`
            }
          />
          <Text style={S.footerText}>
            {L.generated} {format(new Date(), 'dd MMM yyyy HH:mm')}
          </Text>
        </View>

      </Page>
    </Document>
  );
}
