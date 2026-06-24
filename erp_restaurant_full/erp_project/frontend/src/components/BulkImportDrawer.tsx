import { useState, useCallback, useRef } from 'react';
import Papa from 'papaparse';
import SlideDrawer from './SlideDrawer';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';

interface BulkImportDrawerProps {
  open: boolean;
  onClose: () => void;
  categories: any[];
  units: any[];
  suppliers: any[];
}

const REQUIRED_COLUMNS = ['name', 'nameAr'];
const TEMPLATE_HEADERS = 'name,nameAr,sku,categoryId,unitId,supplierId,costPrice,minStockLevel,reorderPoint,yieldFactor,shelfLifeDays,taxCategory,description,descriptionAr';
const TEMPLATE_EXAMPLE = 'Coffee Beans,حبوب القهوة,,1,1,,45.00,10,15,100,365,VAT5,Premium arabica,عربيكا ممتازة';

/**
 * Phase 1: Drag-and-drop CSV/Excel bulk import drawer.
 * Uses PapaParse for client-side parsing before sending to /products/bulk-import.
 */
export default function BulkImportDrawer({ open, onClose, categories, units, suppliers }: BulkImportDrawerProps) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; total: number } | null>(null);

  const reset = () => { setParsed([]); setErrors([]); setResult(null); };

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
      complete: (results) => {
        const rows = results.data as any[];
        const errs: string[] = [];
        const valid: any[] = [];
        rows.forEach((row, i) => {
          const missing = REQUIRED_COLUMNS.filter(c => !row[c]?.trim());
          if (missing.length) {
            errs.push(`Row ${i + 2}: missing required field(s): ${missing.join(', ')}`);
            return;
          }
          valid.push({
            name: row.name?.trim(),
            nameAr: row.nameAr?.trim(),
            sku: row.sku?.trim() || undefined,
            categoryId: row.categoryId ? +row.categoryId : undefined,
            unitId: row.unitId ? +row.unitId : undefined,
            supplierId: row.supplierId ? +row.supplierId : undefined,
            costPrice: row.costPrice ? +row.costPrice : 0,
            minStockLevel: row.minStockLevel ? +row.minStockLevel : 0,
            reorderPoint: row.reorderPoint ? +row.reorderPoint : 0,
            yieldFactor: row.yieldFactor ? +row.yieldFactor : 100,
            shelfLifeDays: row.shelfLifeDays ? +row.shelfLifeDays : undefined,
            taxCategory: row.taxCategory?.trim() || undefined,
            description: row.description?.trim() || undefined,
            descriptionAr: row.descriptionAr?.trim() || undefined,
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
      const res = await api.post('/products/bulk-import', { products: parsed });
      const data = res.data.data;
      setResult(data);
      toast.success(`Imported ${data.imported} of ${data.total} products`);
      qc.invalidateQueries({ queryKey: ['products'] });
      setParsed([]);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_HEADERS + '\n' + TEMPLATE_EXAMPLE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'product-import-template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SlideDrawer open={open} onClose={() => { onClose(); reset(); }} title="📁 Bulk Import Products" width="w-[600px]">
      <div className="space-y-5">
        {/* Template download */}
        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
          <div>
            <p className="text-sm font-medium text-blue-900">Download CSV Template</p>
            <p className="text-xs text-blue-600 mt-0.5">Required columns: name, nameAr. All others optional.</p>
          </div>
          <button onClick={downloadTemplate} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium">⬇ Template</button>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
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

        {/* Validation errors */}
        {errors.length > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 max-h-32 overflow-y-auto">
            <p className="text-xs font-semibold text-red-700 mb-1">⚠ {errors.length} row(s) skipped:</p>
            {errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
          </div>
        )}

        {/* Preview table */}
        {parsed.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-2">✅ {parsed.length} rows ready to import</p>
            <div className="overflow-x-auto border border-gray-100 rounded-xl max-h-56">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {['Name', 'Name (AR)', 'SKU', 'Cost', 'Min Stock'].map(h => (
                      <th key={h} className="text-start px-3 py-2 font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {parsed.slice(0, 50).map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-gray-900">{row.name}</td>
                      <td className="px-3 py-1.5 text-gray-600 font-arabic">{row.nameAr}</td>
                      <td className="px-3 py-1.5 text-gray-400 font-mono">{row.sku || '(auto)'}</td>
                      <td className="px-3 py-1.5">{row.costPrice || 0}</td>
                      <td className="px-3 py-1.5">{row.minStockLevel || 0}</td>
                    </tr>
                  ))}
                  {parsed.length > 50 && <tr><td colSpan={5} className="px-3 py-2 text-gray-400 text-center">...and {parsed.length - 50} more</td></tr>}
                </tbody>
              </table>
            </div>
            <button
              onClick={handleImport}
              disabled={importing}
              className="mt-4 w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white font-semibold py-3 rounded-xl text-sm"
            >
              {importing ? 'Importing...' : `🚀 Import ${parsed.length} Products`}
            </button>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
            <p className="text-2xl mb-1">✅</p>
            <p className="text-sm font-semibold text-green-800">Import complete</p>
            <p className="text-xs text-green-600 mt-1">{result.imported} imported · {result.total - result.imported} skipped (duplicates)</p>
          </div>
        )}

        {/* Reference tables */}
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer font-medium text-gray-700 mb-2">📋 Category / Unit / Supplier ID Reference</summary>
          <div className="grid grid-cols-3 gap-3 mt-2">
            <div>
              <p className="font-semibold text-gray-600 mb-1">Categories</p>
              {categories?.map((c: any) => <p key={c.id}>{c.id} — {c.name}</p>)}
            </div>
            <div>
              <p className="font-semibold text-gray-600 mb-1">Units</p>
              {units?.map((u: any) => <p key={u.id}>{u.id} — {u.abbreviation}</p>)}
            </div>
            <div>
              <p className="font-semibold text-gray-600 mb-1">Suppliers</p>
              {suppliers?.map((s: any) => <p key={s.id}>{s.id} — {s.name}</p>)}
            </div>
          </div>
        </details>
      </div>
    </SlideDrawer>
  );
}
