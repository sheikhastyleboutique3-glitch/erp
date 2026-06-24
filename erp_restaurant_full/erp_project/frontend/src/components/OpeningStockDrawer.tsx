import { useState, useCallback, useRef } from 'react';
import Papa from 'papaparse';
import SlideDrawer from './SlideDrawer';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';

interface OpeningStockDrawerProps {
  open: boolean;
  onClose: () => void;
  branches: any[];
  products: any[];
}

interface RowResult {
  row: number;
  sku: string | null;
  branch: string | null;
  quantity: number | null;
  status: 'imported' | 'error';
  message?: string;
  batchNumber?: string | null;
}

const REQUIRED_COLUMNS = ['sku', 'branch', 'quantity'];
const TEMPLATE_HEADERS = 'sku,branch,quantity,unitCost,batchNumber,manufactureDate,expiryDate,notes';
const TEMPLATE_EXAMPLE_ROWS = [
  'COFFEE-001,Main Warehouse,40,45.00,,,,Dry goods opening count',
  'MILK-001,Main Warehouse,30,5.50,,2026-06-20,2026-06-27,Fresh batch on shelf',
  'MILK-001,Main Warehouse,12,5.50,,2026-06-22,2026-06-29,Second batch (later expiry)',
];

/**
 * Opening-stock bulk importer. Mirrors the product BulkImportDrawer: parses a
 * CSV client-side with PapaParse, previews valid rows, then posts them to
 * /inventory/bulk-import where each row becomes a RECEIPT (auto batch + FEFO).
 *
 * Expiry-tracked products: give each physical batch its own row with that
 * batch's expiryDate (and manufactureDate). Two rows for the same product with
 * different expiry dates create two batches -- FEFO then consumes the earliest.
 */
export default function OpeningStockDrawer({ open, onClose, branches, products }: OpeningStockDrawerProps) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<RowResult[] | null>(null);

  const reset = () => { setParsed([]); setErrors([]); setResults(null); };

  const parseFile = useCallback((file: File) => {
    reset();
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
      toast.error('Only CSV or Excel files are supported');
      return;
    }
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
      complete: (res) => {
        const rows = res.data as any[];
        const errs: string[] = [];
        const valid: any[] = [];
        rows.forEach((row, i) => {
          const missing = REQUIRED_COLUMNS.filter((c) => !String(row[c] ?? '').trim());
          if (missing.length) {
            errs.push(`Row ${i + 2}: missing required field(s): ${missing.join(', ')}`);
            return;
          }
          const qty = Number(String(row.quantity).trim());
          if (!Number.isFinite(qty) || qty <= 0) {
            errs.push(`Row ${i + 2}: quantity must be a positive number (got "${row.quantity}")`);
            return;
          }
          valid.push({
            sku: String(row.sku).trim(),
            branch: String(row.branch).trim(),
            quantity: qty,
            unitCost: String(row.unitCost ?? '').trim() ? Number(String(row.unitCost).trim()) : undefined,
            batchNumber: String(row.batchNumber ?? '').trim() || undefined,
            manufactureDate: String(row.manufactureDate ?? '').trim() || undefined,
            expiryDate: String(row.expiryDate ?? '').trim() || undefined,
            notes: String(row.notes ?? '').trim() || undefined,
          });
        });
        setParsed(valid);
        setErrors(errs);
        if (valid.length) toast.success(`Parsed ${valid.length} valid row(s)${errs.length ? `, ${errs.length} skipped` : ''}`);
        else toast.error('No valid rows found');
      },
      error: (err: any) => toast.error(`Parse error: ${err.message}`),
    });
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = '';
  };

  const handleImport = async () => {
    if (!parsed.length) return;
    setImporting(true);
    try {
      const res = await api.post('/inventory/bulk-import', { rows: parsed });
      const data = res.data.data as { imported: number; failed: number; total: number; results: RowResult[] };
      setResults(data.results);
      if (data.failed === 0) {
        toast.success(`Loaded opening stock for all ${data.imported} row(s)`);
      } else {
        toast(`Loaded ${data.imported} of ${data.total} — ${data.failed} failed`, { icon: '⚠️' });
      }
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setParsed([]);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_HEADERS + '\n' + TEMPLATE_EXAMPLE_ROWS.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'opening-stock-template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const importedCount = results?.filter((r) => r.status === 'imported').length ?? 0;
  const failedResults = results?.filter((r) => r.status === 'error') ?? [];

  return (
    <SlideDrawer open={open} onClose={() => { onClose(); reset(); }} title="📦 Import Opening Stock" width="w-[640px]">
      <div className="space-y-5">
        {/* Intro / how it works */}
        <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-xs text-amber-800 space-y-1">
          <p className="font-semibold text-amber-900">Load your on-hand stock per branch</p>
          <p>Each row is recorded as a stock receipt. Match <code>sku</code> to an existing product and <code>branch</code> to a branch name (or its ID).</p>
          <p>For expiry-tracked items, give each physical batch its own row with that batch's <code>expiryDate</code>. Two rows for the same product with different expiry dates create two batches (FEFO uses the earliest first).</p>
        </div>

        {/* Template download */}
        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
          <div>
            <p className="text-sm font-medium text-blue-900">Download CSV Template</p>
            <p className="text-xs text-blue-600 mt-0.5">Required columns: sku, branch, quantity. Others optional.</p>
          </div>
          <button onClick={downloadTemplate} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium">⬇ Template</button>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
            dragging ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-400 hover:bg-gray-50'
          }`}
        >
          <p className="text-3xl mb-2">📂</p>
          <p className="text-sm font-medium text-gray-700">Drag & drop CSV or Excel file here</p>
          <p className="text-xs text-gray-400 mt-1">or click to browse — max 2MB</p>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={onFileChange} className="hidden" />
        </div>

        {/* Validation errors (client-side) */}
        {errors.length > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 max-h-32 overflow-y-auto">
            <p className="text-xs font-semibold text-red-700 mb-1">⚠ {errors.length} row(s) skipped:</p>
            {errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
          </div>
        )}

        {/* Preview table */}
        {parsed.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-2">✅ {parsed.length} row(s) ready to import</p>
            <div className="overflow-x-auto border border-gray-100 rounded-xl max-h-56">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {['SKU', 'Branch', 'Qty', 'Cost', 'Mfg', 'Expiry'].map((h) => (
                      <th key={h} className="text-start px-3 py-2 font-semibold text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((p, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="px-3 py-1.5">{p.sku}</td>
                      <td className="px-3 py-1.5">{p.branch}</td>
                      <td className="px-3 py-1.5">{p.quantity}</td>
                      <td className="px-3 py-1.5">{p.unitCost ?? '—'}</td>
                      <td className="px-3 py-1.5">{p.manufactureDate ?? '—'}</td>
                      <td className="px-3 py-1.5">{p.expiryDate ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={handleImport}
              disabled={importing}
              className="mt-3 w-full bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {importing ? 'Importing…' : `Import ${parsed.length} row(s)`}
            </button>
          </div>
        )}

        {/* Server results */}
        {results && (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-100 rounded-xl p-3">
              <p className="text-sm font-semibold text-green-800">✅ {importedCount} row(s) imported</p>
            </div>
            {failedResults.length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 max-h-48 overflow-y-auto">
                <p className="text-xs font-semibold text-red-700 mb-2">⚠ {failedResults.length} row(s) failed — fix these and re-upload:</p>
                {failedResults.map((r, i) => {
                  const where = r.sku ? ` (${r.sku}${r.branch ? ' @ ' + r.branch : ''})` : '';
                  return (
                    <p key={i} className="text-xs text-red-600">
                      Row {r.row}{where}: {r.message}
                    </p>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Branch ID reference */}
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer font-medium text-gray-700 mb-2">📋 Branch name / ID reference</summary>
          <div className="grid grid-cols-2 gap-3 mt-2">
            {branches?.map((b: any) => <p key={b.id}>{b.id} — {b.name}{b.isWarehouse ? ' (warehouse)' : ''}</p>)}
          </div>
          <p className="mt-2 text-gray-400">{products?.length ?? 0} product SKU(s) available. SKUs must match existing products exactly (create products first via Catalog → Bulk Import).</p>
        </details>
      </div>
    </SlideDrawer>
  );
}
