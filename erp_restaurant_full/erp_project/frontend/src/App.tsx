import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './contexts/AuthContext';
import api from './lib/api';
import { applyTheme, saveThemeLocal, themeFromSettings } from './lib/theme';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import RequisitionsPage from './pages/RequisitionsPage';
import NewRequisitionPage from './pages/NewRequisitionPage';
import RequisitionDetailPage from './pages/RequisitionDetailPage';
import CatalogPage from './pages/CatalogPage';
import InventoryPage from './pages/InventoryPage';
import WastagePage from './pages/WastagePage';
import SuppliersPage from './pages/SuppliersPage';
import PurchaseOrdersPage from './pages/PurchaseOrdersPage';
import TransfersPage from './pages/TransfersPage';
import BranchesPage from './pages/BranchesPage';
import UsersPage from './pages/UsersPage';
import CategoriesPage from './pages/CategoriesPage';
import SettingsPage from './pages/SettingsPage';
import AlertsPage from './pages/AlertsPage';
import AdminPage from './pages/AdminPage';
import ReportsPage from './pages/ReportsPage';
import PricingPage from './pages/PricingPage';
import AuditLogPage from './pages/AuditLogPage';
import NotificationsPage from './pages/NotificationsPage';
import UnitsPage from './pages/UnitsPage';
import POSPage from './pages/POSPage';
import KDSPage from './pages/KDSPage';
import SalesDashboardPage from './pages/SalesDashboardPage';
import ProductionPage from './pages/ProductionPage';
import TablesPage from './pages/TablesPage';
import PromotionsPage from './pages/PromotionsPage';
import RecipesPage from './pages/RecipesPage';
import ModifiersPage from './pages/ModifiersPage';
import StaffTasksPage from './pages/StaffTasksPage';
import WaiterPage from './pages/WaiterPage';
import LoadingSpinner from './components/LoadingSpinner';

type Role = string;

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <LoadingSpinner />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const ADMIN_ROLES = ['SUPER_ADMIN'];
const MANAGER_ROLES = ['SUPER_ADMIN', 'BRANCH_MANAGER'];
const OPS_ROLES = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'PROCUREMENT', 'WAREHOUSE'];
const PROCUREMENT_ROLES = ['SUPER_ADMIN', 'PROCUREMENT', 'WAREHOUSE'];
const REPORT_ROLES = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'PROCUREMENT'];

/**
 * Loads the saved theme from the backend Settings (group `branding`) once the
 * user is authenticated and applies it app-wide. localStorage gave us the
 * instant paint; this keeps the theme in sync across devices/sessions.
 */
function useSyncTheme() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['settings', 'branding'],
    queryFn: () => api.get('/settings', { params: { group: 'branding' } }).then(r => r.data.data),
    enabled: !!user,
    staleTime: 60_000,
  });
  useEffect(() => {
    if (!data) return;
    const map: Record<string, string> = {};
    data.forEach((s: any) => { map[s.key] = s.value; });
    const theme = themeFromSettings(map);
    applyTheme(theme);
    saveThemeLocal(theme);
  }, [data]);
}

export default function App() {
  useSyncTheme();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        {/* Open to all authenticated users */}
        <Route index element={<DashboardPage />} />
        <Route path="requisitions" element={<RequisitionsPage />} />
        <Route path="requisitions/new" element={<NewRequisitionPage />} />
        <Route path="requisitions/:id" element={<RequisitionDetailPage />} />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="wastage" element={<WastagePage />} />
        <Route path="alerts" element={<AlertsPage />} />

        {/* Restaurant POS / Kitchen / Sales — front-of-house */}
        <Route
          path="pos"
          element={
            <ProtectedRoute roles={['SUPER_ADMIN', 'BRANCH_MANAGER', 'CASHIER']}>
              <POSPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="kds"
          element={
            <ProtectedRoute roles={['SUPER_ADMIN', 'BRANCH_MANAGER', 'KITCHEN', 'PASTRY', 'BARISTA']}>
              <KDSPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="sales-dashboard"
          element={
            <ProtectedRoute roles={MANAGER_ROLES}>
              <SalesDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="production"
          element={
            <ProtectedRoute roles={['SUPER_ADMIN', 'BRANCH_MANAGER', 'KITCHEN', 'PASTRY', 'WAREHOUSE']}>
              <ProductionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="tables"
          element={
            <ProtectedRoute roles={['SUPER_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'WAITER']}>
              <TablesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="waiter"
          element={
            <ProtectedRoute roles={['SUPER_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'WAITER']}>
              <WaiterPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="promotions"
          element={
            <ProtectedRoute roles={MANAGER_ROLES}>
              <PromotionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="recipes"
          element={
            <ProtectedRoute roles={['SUPER_ADMIN', 'BRANCH_MANAGER', 'KITCHEN', 'PASTRY']}>
              <RecipesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="modifiers"
          element={
            <ProtectedRoute roles={['SUPER_ADMIN', 'BRANCH_MANAGER']}>
              <ModifiersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="staff-tasks"
          element={
            <ProtectedRoute roles={['SUPER_ADMIN', 'BRANCH_MANAGER', 'CLEANER', 'WAREHOUSE']}>
              <StaffTasksPage />
            </ProtectedRoute>
          }
        />

        {/* Inventory — ops roles */}
        <Route
          path="inventory"
          element={
            <ProtectedRoute roles={OPS_ROLES}>
              <InventoryPage />
            </ProtectedRoute>
          }
        />

        {/* Branch Transfers — ops roles */}
        <Route
          path="transfers"
          element={
            <ProtectedRoute roles={OPS_ROLES}>
              <TransfersPage />
            </ProtectedRoute>
          }
        />

        {/* Suppliers — procurement roles */}
        <Route
          path="suppliers"
          element={
            <ProtectedRoute roles={PROCUREMENT_ROLES}>
              <SuppliersPage />
            </ProtectedRoute>
          }
        />

        {/* Purchase Orders — procurement roles */}
        <Route
          path="purchase-orders"
          element={
            <ProtectedRoute roles={PROCUREMENT_ROLES}>
              <PurchaseOrdersPage />
            </ProtectedRoute>
          }
        />

        {/* Reports — report roles */}
        <Route
          path="reports"
          element={
            <ProtectedRoute roles={REPORT_ROLES}>
              <ReportsPage />
            </ProtectedRoute>
          }
        />

        {/* Pricing — procurement + admin */}
        <Route
          path="pricing"
          element={
            <ProtectedRoute roles={['SUPER_ADMIN', 'PROCUREMENT']}>
              <PricingPage />
            </ProtectedRoute>
          }
        />

        {/* Branches — super admin only */}
        <Route
          path="branches"
          element={
            <ProtectedRoute roles={ADMIN_ROLES}>
              <BranchesPage />
            </ProtectedRoute>
          }
        />

        {/* Users — manager+ */}
        <Route
          path="users"
          element={
            <ProtectedRoute roles={MANAGER_ROLES}>
              <UsersPage />
            </ProtectedRoute>
          }
        />

        {/* Categories — manager+ */}
        <Route
          path="categories"
          element={
            <ProtectedRoute roles={MANAGER_ROLES}>
              <CategoriesPage />
            </ProtectedRoute>
          }
        />

        {/* Units — super admin only */}
        <Route
          path="units"
          element={
            <ProtectedRoute roles={ADMIN_ROLES}>
              <UnitsPage />
            </ProtectedRoute>
          }
        />

        {/* Settings — super admin only */}
        <Route
          path="settings"
          element={
            <ProtectedRoute roles={ADMIN_ROLES}>
              <SettingsPage />
            </ProtectedRoute>
          }
        />

        {/* Notifications — all authenticated (preferences) */}
        <Route path="notifications" element={<NotificationsPage />} />

        {/* Audit Log — super admin only */}
        <Route
          path="audit"
          element={
            <ProtectedRoute roles={ADMIN_ROLES}>
              <AuditLogPage />
            </ProtectedRoute>
          }
        />

        {/* Admin panel — super admin only */}
        <Route
          path="admin"
          element={
            <ProtectedRoute roles={ADMIN_ROLES}>
              <AdminPage />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
