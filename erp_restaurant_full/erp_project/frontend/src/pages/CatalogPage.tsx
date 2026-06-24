import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import SlideDrawer from '../components/SlideDrawer';
import BulkImportDrawer from '../components/BulkImportDrawer';
import { ALLERGENS } from '../lib/allergens';
import toast from 'react-hot-toast';

interface CartItem { productId: number; name: string; nameAr: string; unit: string; qty: number; unitId?: number; }

const EMPTY_FORM = {
  name: '', nameAr: '', sku: '', categoryId: '', unitId: '', supplierId: '',
  minStockLevel: '0', reorderPoint: '0', costPrice: '0', taxCategory: '',
  yieldFactor: '100', shelfLifeDays: '', description: '', descriptionAr: '',
  allergens: [] as string[], allergenNotes: '', allergenNotesAr: '',
  tracksExpiry: false, expiryTrackingType: '' as '' | 'SHELF_LIFE_DAYS' | 'MANUFACTURE_TO_EXPIRY',
};

/** Roles that can create / edit / delete / import products and upload images */
const PRODUCT_WRITE_ROLES = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'PROCUREMENT'];

export default function CatalogPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isRTL = i18n.language === 'ar';

  // Derived permission flag — used to conditionally render write controls
  const canWrite = PRODUCT_WRITE_ROLES.includes(user?.role || '');

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [supplierFilter, setSupplierFilter] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  // Slide-out drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bulkDrawerOpen, setBulkDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [productForm, setProductForm] = useState({ ...EMPTY_FORM });
  const [imageUploading, setImageUploading] = useState(false);

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/categories').then(r => r.data.data) });
  const { data: products, isLoading } = useQuery({
    queryKey: ['products', selectedCategory, search, supplierFilter],
    queryFn: () => api.get('/products', { params: { categoryId: selectedCategory || undefined, search: search || undefined } }).then(r => r.data.data),
    select: (data: any[]) => supplierFilter ? data.filter((p: any) => p.supplierId === +supplierFilter) : data,
  });
  const { data: units } = useQuery({ queryKey: ['units'], queryFn: () => api.get('/units').then(r => r.data.data) });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: () => api.get('/suppliers').then(r => r.data.data) });

  // Track the saved product so image upload works immediately after create
  const [savedProductId, setSavedProductId] = useState<number | null>(null);

  const saveMutation = useMutation({
    mutationFn: (data: any) => editingProduct
      ? api.patch(`/products/${editingProduct.id}`, data)
      : api.post('/products', data),
    onSuccess: (res) => {
      const saved = res.data.data;
      if (editingProduct) {
        // Edit: close drawer
        toast.success('Product updated');
        qc.invalidateQueries({ queryKey: ['products'] });
        setDrawerOpen(false);
        setEditingProduct(null);
        setSavedProductId(null);
      } else {
        // Create: keep drawer open so user can upload image
        toast.success('Product created — you can now upload an image below');
        qc.invalidateQueries({ queryKey: ['products'] });
        setSavedProductId(saved.id);
        // Pre-fill editing product so image section appears
        setEditingProduct(saved);
      }
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => api.post(`/products/${id}/duplicate`),
    onSuccess: () => { toast.success('Product duplicated'); qc.invalidateQueries({ queryKey: ['products'] }); },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/products/${id}/archive`),
    onSuccess: () => { toast.success('Product archived'); qc.invalidateQueries({ queryKey: ['products'] }); qc.invalidateQueries({ queryKey: ['products-archived'] }); },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/products/${id}/restore`),
    onSuccess: () => { toast.success('Product restored ✅'); qc.invalidateQueries({ queryKey: ['products'] }); qc.invalidateQueries({ queryKey: ['products-archived'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Restore failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/products/${id}`),
    onSuccess: () => { toast.success('Product permanently deleted'); qc.invalidateQueries({ queryKey: ['products'] }); qc.invalidateQueries({ queryKey: ['products-archived'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Delete failed'),
  });

  const [showArchived, setShowArchived] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const { data: archivedProducts } = useQuery({
    queryKey: ['products-archived'],
    queryFn: () => api.get('/products/archived').then(r => r.data.data),
    enabled: user?.role === 'SUPER_ADMIN' && showArchived,
  });

  const addToCart = (product: any) => {
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) return prev.map(i => i.productId === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { productId: product.id, name: product.name, nameAr: product.nameAr, unit: product.unit?.abbreviation || '', qty: 1, unitId: product.unitId }];
    });
    toast.success(isRTL ? `تمت الإضافة: ${product.nameAr}` : `Added: ${product.name}`, { duration: 1500 });
  };

  // Update a cart line's quantity. Decimal values (e.g. 0.1) are allowed and an
  // empty / invalid keystroke is ignored instead of silently deleting the line.
  // Removal is explicit via removeFromCart (the × button).
  const updateQty = (productId: number, qty: number) => {
    if (!Number.isFinite(qty) || qty < 0) return; // ignore transient empty/NaN input
    setCart(prev => prev.map(i => i.productId === productId ? { ...i, qty } : i));
  };
  const removeFromCart = (productId: number) =>
    setCart(prev => prev.filter(i => i.productId !== productId));

  const proceedToRequisition = () => {
    if (!cart.length) { toast.error('Cart is empty'); return; }
    navigate('/requisitions/new', { state: { cartItems: cart } });
  };

  const openNewProduct = () => {
    setEditingProduct(null);
    setSavedProductId(null);
    setProductForm({ ...EMPTY_FORM });
    setDrawerOpen(true);
  };

  const openEditProduct = (p: any) => {
    setSavedProductId(null);
    setEditingProduct(p);
    setProductForm({
      name: p.name, nameAr: p.nameAr, sku: p.sku,
      categoryId: p.categoryId?.toString() || '',
      unitId: p.unitId?.toString() || '',
      supplierId: p.supplierId?.toString() || '',
      minStockLevel: p.minStockLevel.toString(),
      reorderPoint: p.reorderPoint.toString(),
      costPrice: p.costPrice.toString(),
      taxCategory: p.taxCategory || '',
      yieldFactor: p.yieldFactor.toString(),
      shelfLifeDays: p.shelfLifeDays?.toString() || '',
      description: p.description || '',
      descriptionAr: p.descriptionAr || '',
      allergens: p.allergens || [],
      allergenNotes: p.allergenNotes || '',
      allergenNotesAr: p.allergenNotesAr || '',
      tracksExpiry: !!p.tracksExpiry,
      expiryTrackingType: p.expiryTrackingType || '',
    });
    setDrawerOpen(true);
    setMenuOpen(null);
  };

  const toggleAllergen = (a: string) => {
    setProductForm(p => ({
      ...p,
      allergens: p.allergens.includes(a)
        ? p.allergens.filter(x => x !== a)
        : [...p.allergens, a],
    }));
  };

  const handleSaveProduct = () => {
    const data: any = {
      ...productForm,
      categoryId: productForm.categoryId ? +productForm.categoryId : undefined,
      unitId: productForm.unitId ? +productForm.unitId : undefined,
      supplierId: productForm.supplierId ? +productForm.supplierId : undefined,
      minStockLevel: +productForm.minStockLevel,
      reorderPoint: +productForm.reorderPoint,
      costPrice: +productForm.costPrice,
      yieldFactor: +productForm.yieldFactor,
      allergens: productForm.allergens,
      allergenNotes: productForm.allergenNotes || undefined,
      allergenNotesAr: productForm.allergenNotesAr || undefined,
      tracksExpiry: productForm.tracksExpiry,
      // Only persist expiry config when tracking is enabled.
      expiryTrackingType: productForm.tracksExpiry && productForm.expiryTrackingType
        ? productForm.expiryTrackingType
        : null,
      shelfLifeDays:
        productForm.tracksExpiry && productForm.expiryTrackingType === 'SHELF_LIFE_DAYS' && productForm.shelfLifeDays
          ? +productForm.shelfLifeDays
          : undefined,
    };
    if (!data.sku) delete data.sku;
    saveMutation.mutate(data);
  };

  const field = (key: keyof typeof EMPTY_FORM, label: string, type = 'text') => (
    <div key={key}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={String(productForm[key] ?? '')}
        onChange={e => setProductForm(p => ({ ...p, [key]: e.target.value }))}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );

  return (
    <div>
      <PageHeader
        title={t('product.title')}
        subtitle={`${products?.length || 0} items`}
        actions={
          <div className="flex gap-2">
            {/* Write controls — only for authorized roles */}
            {canWrite && (
              <>
                <button
                  onClick={openNewProduct}
                  className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-medium"
                >
                  + {t('product.addProduct')}
                </button>
                <button
                  onClick={() => setBulkDrawerOpen(true)}
                  className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50"
                >
                  📁 {t('product.bulkImport')}
                </button>
                <button
                  onClick={async () => {
                    try {
                      const { downloadCsv } = await import('../lib/api');
                      await downloadCsv('/products/export', `products-${new Date().toISOString().slice(0,10)}.csv`);
                    } catch { toast.error('Export failed'); }
                  }}
                  className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50"
                >
                  📥 Export CSV
                </button>
              </>
            )}
            <button
              onClick={() => setCartOpen(true)}
              className="relative flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-medium"
            >
              🛒 {t('nav.requisitions')}
              {cart.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {cart.length}
                </span>
              )}
            </button>
          </div>
        }
      />

      {/* Search + category filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 start-3 flex items-center text-gray-400">🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('product.search')}
            className="w-full ps-9 pe-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <select
          value={supplierFilter}
          onChange={e => setSupplierFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm min-w-[160px]"
        >
          <option value="">All Suppliers</option>
          {suppliers?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`flex-shrink-0 px-3 py-2 rounded-xl text-sm font-medium ${
              !selectedCategory ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t('common.all')}
          </button>
          {categories?.map((cat: any) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium ${
                selectedCategory === cat.id ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {cat.icon && <span>{cat.icon}</span>}
              {isRTL ? cat.nameAr : cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Product grid */}
      {isLoading ? <LoadingSpinner /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {products?.map((product: any) => (
            <div
              key={product.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow group relative"
            >
              {/* Product image */}
              <div className="aspect-square bg-gradient-to-br from-gray-50 to-gray-100 relative overflow-hidden">
                {product.imageUrl
                  ? <img
                      src={product.imageUrl.startsWith('http') ? product.imageUrl : product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.style.display = 'none';
                        const fallback = target.parentElement?.querySelector('.img-fallback') as HTMLElement;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                    />
                  : null
                }
                <div
                  className="img-fallback w-full h-full items-center justify-center"
                  style={{ display: product.imageUrl ? 'none' : 'flex' }}
                >
                  <span className="text-4xl">{product.category?.icon || '📦'}</span>
                </div>
              </div>

              {/* Three-dot action menu — write roles only */}
              {canWrite && (
                <div className="absolute top-2 end-2">
                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === product.id ? null : product.id); }}
                    className="bg-white/90 hover:bg-white text-gray-600 rounded-lg p-1.5 text-xs shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ⋯
                  </button>
                  {menuOpen === product.id && (
                    <div className="absolute end-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 min-w-32 py-1">
                      <button
                        onClick={() => openEditProduct(product)}
                        className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        ✏️ {t('product.edit')}
                      </button>
                      <button
                        onClick={() => { duplicateMutation.mutate(product.id); setMenuOpen(null); }}
                        className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        📋 {t('product.duplicate')}
                      </button>
                      <button
                        onClick={() => { archiveMutation.mutate(product.id); setMenuOpen(null); }}
                        className="w-full text-start px-3 py-1.5 text-sm text-orange-600 hover:bg-orange-50"
                      >
                        🗃️ {t('product.archive')}
                      </button>
                      {user?.role === 'SUPER_ADMIN' && (
                        <button
                          onClick={() => { setDeleteConfirmId(product.id); setMenuOpen(null); }}
                          className="w-full text-start px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 border-t border-gray-100"
                        >
                          🗑️ {t('product.delete')} (Permanent)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Card body */}
              <div className="p-3">
                <p className="text-xs text-gray-400 font-mono">{product.sku}</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5 line-clamp-2 leading-tight">
                  {isRTL ? product.nameAr : product.name}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {isRTL ? product.category?.nameAr : product.category?.name}
                </p>
                {product.allergens?.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 mt-1.5" title={product.allergens.map((a: string) => t(`allergen.${a}`)).join(', ')}>
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded-full">
                      ⚠️ {t('allergen.contains')}
                    </span>
                    {product.allergens.slice(0, 3).map((a: string) => (
                      <span key={a} className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">
                        {t(`allergen.${a}`)}
                      </span>
                    ))}
                    {product.allergens.length > 3 && (
                      <span className="text-[10px] text-amber-700">+{product.allergens.length - 3}</span>
                    )}
                  </div>
                )}
                {product.costPrice > 0 && (
                  <p className="text-xs text-green-600 font-medium mt-0.5">
                    QAR {product.costPrice.toFixed(2)}/{product.unit?.abbreviation}
                  </p>
                )}
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {product.unit?.abbreviation}
                  </span>
                  <button
                    onClick={() => addToCart(product)}
                    className="bg-brand-600 hover:bg-brand-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium"
                  >
                    + {t('product.addToCart')}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {products?.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">🔍</p>
              <p>{t('common.noData')}</p>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="text-center">
              <div className="text-4xl mb-3">⚠️</div>
              <h3 className="text-lg font-bold text-gray-900">Permanently Delete Product?</h3>
              <p className="text-sm text-gray-500 mt-2">
                This will permanently delete product #{deleteConfirmId}.
                If the product has been used in requisitions or purchase orders, it will be archived instead.
                This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { deleteMutation.mutate(deleteConfirmId!); setDeleteConfirmId(null); }}
                disabled={deleteMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white py-2.5 rounded-xl text-sm font-bold"
              >
                {deleteMutation.isPending ? 'Deleting...' : '🗑️ Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archived Products Section — SUPER_ADMIN only */}
      {user?.role === 'SUPER_ADMIN' && (
        <div className="mt-8">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-700 mb-4"
          >
            <span className={`transition-transform ${showArchived ? 'rotate-90' : ''}`}>▶</span>
            🗃️ Archived Products
            {archivedProducts && archivedProducts.length > 0 && (
              <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-medium">
                {archivedProducts.length}
              </span>
            )}
          </button>

          {showArchived && (
            <div className="space-y-4">
              {!archivedProducts ? (
                <LoadingSpinner size="sm" />
              ) : archivedProducts.length === 0 ? (
                <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-2xl">
                  <p className="text-2xl mb-2">🗃️</p>
                  <p className="text-sm">No archived products</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {archivedProducts.map((product: any) => (
                    <div
                      key={product.id}
                      className="bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden opacity-75 hover:opacity-100 transition-opacity"
                    >
                      {/* Image */}
                      <div className="aspect-square bg-gray-100 relative overflow-hidden">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover grayscale" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-4xl grayscale">{product.category?.icon || '📦'}</span>
                          </div>
                        )}
                        {/* Archived badge */}
                        <div className="absolute top-2 start-2">
                          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">🗃️ Archived</span>
                        </div>
                      </div>

                      {/* Card body */}
                      <div className="p-3">
                        <p className="text-xs text-gray-400 font-mono">{product.sku}</p>
                        <p className="text-sm font-semibold text-gray-700 mt-0.5 line-clamp-2 leading-tight">
                          {isRTL ? product.nameAr : product.name}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {isRTL ? product.category?.nameAr : product.category?.name}
                        </p>
                        {product.archivedAt && (
                          <p className="text-xs text-orange-500 mt-1">
                            Archived: {new Date(product.archivedAt).toLocaleDateString()}
                          </p>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => restoreMutation.mutate(product.id)}
                            disabled={restoreMutation.isPending}
                            className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-xs py-1.5 rounded-lg font-medium"
                            title="Restore product to active catalog"
                          >
                            ↩ Restore
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(product.id)}
                            className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs py-1.5 rounded-lg font-medium"
                            title="Permanently delete this product"
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cart Modal */}
      <Modal open={cartOpen} onClose={() => setCartOpen(false)} title={`🛒 Cart (${cart.length} items)`} size="lg">
        {cart.length === 0 ? (
          <p className="text-center text-gray-400 py-8">Cart is empty</p>
        ) : (
          <div className="space-y-3">
            {cart.map(item => (
              <div key={item.productId} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{isRTL ? item.nameAr : item.name}</p>
                  <p className="text-xs text-gray-500">{item.unit}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQty(item.productId, Math.max(0, Math.round((item.qty - 1) * 100) / 100))} className="w-7 h-7 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 flex items-center justify-center text-sm">-</button>
                  <input type="number" value={item.qty} min={0} step="any" onChange={e => { const v = e.target.value; if (v === '') { updateQty(item.productId, 0); return; } updateQty(item.productId, parseFloat(v)); }} className="w-16 text-center border border-gray-200 rounded-lg py-1 text-sm" />
                  <button onClick={() => updateQty(item.productId, Math.round((item.qty + 1) * 100) / 100)} className="w-7 h-7 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 flex items-center justify-center text-sm">+</button>
                  <button onClick={() => removeFromCart(item.productId)} className="w-7 h-7 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center text-sm">×</button>
                </div>
              </div>
            ))}
            <div className="pt-3 border-t border-gray-100">
              <button onClick={proceedToRequisition} className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl">
                Proceed to Requisition →
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add/Edit Product — right-side slide-out drawer (write roles only) */}
      {canWrite && (
        <SlideDrawer
          open={drawerOpen}
          onClose={() => { setDrawerOpen(false); setEditingProduct(null); }}
          title={editingProduct ? `✏️ Edit: ${editingProduct.name}` : '+ Add Product'}
          width="w-[560px]"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {field('name', 'Name (EN)')}
              {field('nameAr', 'Name (AR)')}
              {field('sku', 'SKU (auto if empty)')}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                <select value={productForm.categoryId} onChange={e => setProductForm(p => ({ ...p, categoryId: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                  <option value="">Select</option>
                  {categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Unit of Measure</label>
                <select value={productForm.unitId} onChange={e => setProductForm(p => ({ ...p, unitId: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                  <option value="">Select</option>
                  {units?.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Supplier</label>
                <select value={productForm.supplierId} onChange={e => setProductForm(p => ({ ...p, supplierId: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                  <option value="">Select</option>
                  {suppliers?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pricing & Stock</p>
              <div className="grid grid-cols-2 gap-4">
                {field('costPrice', 'Base Cost Price', 'number')}
                {field('taxCategory', 'Tax / VAT Category')}
                {field('minStockLevel', 'Min Stock Level', 'number')}
                {field('reorderPoint', 'Reorder Point', 'number')}
                {field('yieldFactor', 'Yield Factor (%)', 'number')}
              </div>
            </div>

            {/* Expiry tracking configuration (Requirement #3) */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Expiry Tracking</p>
              <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={productForm.tracksExpiry}
                  onChange={e => setProductForm(p => ({
                    ...p,
                    tracksExpiry: e.target.checked,
                    expiryTrackingType: e.target.checked ? (p.expiryTrackingType || 'SHELF_LIFE_DAYS') : '',
                  }))}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">Tracks Expiry?</span>
              </label>

              {productForm.tracksExpiry && (
                <div className="space-y-3 pl-1">
                  <div className="flex flex-col gap-2">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="expiryTrackingType"
                        checked={productForm.expiryTrackingType === 'SHELF_LIFE_DAYS'}
                        onChange={() => setProductForm(p => ({ ...p, expiryTrackingType: 'SHELF_LIFE_DAYS' }))}
                        className="mt-1"
                      />
                      <span className="text-sm text-gray-700">
                        <span className="font-medium">By Shelf Life Days</span>
                        <span className="block text-xs text-gray-500">Expiry = date received + shelf life (e.g. milk: 5 days)</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="expiryTrackingType"
                        checked={productForm.expiryTrackingType === 'MANUFACTURE_TO_EXPIRY'}
                        onChange={() => setProductForm(p => ({ ...p, expiryTrackingType: 'MANUFACTURE_TO_EXPIRY' }))}
                        className="mt-1"
                      />
                      <span className="text-sm text-gray-700">
                        <span className="font-medium">By Date of Manufacture → Expiry</span>
                        <span className="block text-xs text-gray-500">Factory-printed dates entered per batch at receiving (e.g. canned goods)</span>
                      </span>
                    </label>
                  </div>

                  {productForm.expiryTrackingType === 'SHELF_LIFE_DAYS' && (
                    <div className="max-w-[200px]">
                      {field('shelfLifeDays', 'Shelf Life (days)', 'number')}
                    </div>
                  )}
                  {productForm.expiryTrackingType === 'MANUFACTURE_TO_EXPIRY' && (
                    <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                      Manufacture &amp; expiry dates are captured per batch on the receiving screen.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                ⚠️ {t('allergen.title')}
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {ALLERGENS.map((a) => {
                  const active = productForm.allergens.includes(a);
                  return (
                    <button
                      type="button"
                      key={a}
                      onClick={() => toggleAllergen(a)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        active
                          ? 'bg-amber-100 text-amber-800 border-amber-300 font-semibold'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {active ? '✓ ' : ''}{t(`allergen.${a}`)}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('allergen.notes')} (EN)</label>
                  <input value={productForm.allergenNotes} onChange={e => setProductForm(p => ({ ...p, allergenNotes: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('allergen.notes')} (AR)</label>
                  <input value={productForm.allergenNotesAr} onChange={e => setProductForm(p => ({ ...p, allergenNotesAr: e.target.value }))} dir="rtl" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-arabic" />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Description</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Description (EN)</label>
                  <textarea value={productForm.description} onChange={e => setProductForm(p => ({ ...p, description: e.target.value }))} rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Description (AR)</label>
                  <textarea value={productForm.descriptionAr} onChange={e => setProductForm(p => ({ ...p, descriptionAr: e.target.value }))} rows={3} dir="rtl" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none font-arabic" />
                </div>
              </div>
            </div>

            {/* Multi-image upload — shown for existing products AND newly created ones */}
            {(editingProduct || savedProductId) && (() => {
              const productId = editingProduct?.id ?? savedProductId;
              const existingUrls: string[] = editingProduct?.imageUrls ?? [];
              return (
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Product Images (max 2MB each)
                  </p>
                  {existingUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {existingUrls.map((url: string, i: number) => (
                        <div key={i} className="relative group">
                          <img src={url} alt={`img-${i}`} className="w-16 h-16 object-cover rounded-xl border border-gray-200" />
                          <button
                            onClick={async () => {
                              try {
                                await api.delete(`/products/${productId}/image`, { data: { imageUrl: url } });
                                toast.success('Image removed');
                                const updated = await api.get(`/products/${productId}`);
                                setEditingProduct(updated.data.data);
                                qc.invalidateQueries({ queryKey: ['products'] });
                              } catch (err: any) {
                                toast.error(err.response?.data?.message || 'Delete failed');
                              }
                            }}
                            className="absolute -top-1.5 -end-1.5 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                            title="Remove image"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-5 cursor-pointer transition-colors ${
                    imageUploading ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-brand-400 hover:bg-gray-50'
                  }`}>
                    <span className="text-2xl mb-1">🖼️</span>
                    <span className="text-xs text-gray-500">
                      {imageUploading ? 'Uploading...' : 'Click to upload image (PNG, JPG, WebP — max 2MB)'}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={imageUploading}
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 2 * 1024 * 1024) { toast.error('File exceeds 2MB limit'); return; }
                        setImageUploading(true);
                        try {
                          const fd = new FormData();
                          fd.append('image', file);
                          // Delete Content-Type so axios sets it with the correct multipart boundary
                          await api.post(`/products/${productId}/image`, fd, {
                            headers: { 'Content-Type': undefined },
                          });
                          toast.success('Image uploaded');
                          qc.invalidateQueries({ queryKey: ['products'] });
                          // Refresh editingProduct so thumbnails update
                          const updated = await api.get(`/products/${productId}`);
                          setEditingProduct(updated.data.data);
                        } catch (err: any) {
                          toast.error(err.response?.data?.message || 'Upload failed');
                        } finally {
                          setImageUploading(false);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                </div>
              );
            })()}

            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <button
                onClick={() => { setDrawerOpen(false); setEditingProduct(null); setSavedProductId(null); }}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium"
              >
                {savedProductId ? 'Done' : t('common.cancel')}
              </button>
              {/* Hide Save button once product is created and we're in image-upload mode */}
              {!savedProductId && (
                <button
                  onClick={handleSaveProduct}
                  disabled={saveMutation.isPending || !productForm.name}
                  className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white py-2.5 rounded-xl text-sm font-medium"
                >
                  {saveMutation.isPending ? 'Saving...' : t('common.save')}
                </button>
              )}
            </div>
          </div>
        </SlideDrawer>
      )}

      {/* Bulk Import Drawer (write roles only) */}
      {canWrite && (
        <BulkImportDrawer
          open={bulkDrawerOpen}
          onClose={() => setBulkDrawerOpen(false)}
          categories={categories || []}
          units={units || []}
          suppliers={suppliers || []}
        />
      )}
    </div>
  );
}
