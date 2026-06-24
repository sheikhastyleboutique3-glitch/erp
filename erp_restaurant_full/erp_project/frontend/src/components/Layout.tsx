import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useNotificationSounds } from '../lib/useNotificationSounds';
import { unlockAudio } from '../lib/sound';
import { toggleDarkMode, loadThemeLocal } from '../lib/theme';
import {
  Squares2X2Icon, ClipboardDocumentListIcon, ShoppingBagIcon, TrashIcon,
  BellAlertIcon, ChatBubbleLeftRightIcon, ArchiveBoxIcon, TruckIcon,
  DocumentTextIcon, CurrencyDollarIcon, ChartBarIcon, BuildingOffice2Icon,
  UsersIcon, TagIcon, ScaleIcon, Cog6ToothIcon, DocumentMagnifyingGlassIcon,
  ShieldCheckIcon, Bars3Icon, ChevronDownIcon, SunIcon, MoonIcon,
  BellIcon, BellSlashIcon, XMarkIcon, BuildingStorefrontIcon,
  GlobeAltIcon, ArrowRightOnRectangleIcon, ArrowsRightLeftIcon,
  BeakerIcon, ClipboardDocumentCheckIcon, UserGroupIcon, FireIcon, IdentificationIcon,
} from '@heroicons/react/24/outline';

type Role = string;
type IconType = React.ComponentType<{ className?: string }>;

interface NavItem {
  key: string;
  path: string;
  icon: IconType;
  roles: Role[];
}
interface NavSection {
  label: string; // i18n key under navGroups.*
  items: NavItem[];
}

// Modules grouped into Odoo-style "apps". A section is hidden entirely when the
// user can't see any of its items.
const NAV_SECTIONS: NavSection[] = [
  {
    label: 'overview',
    items: [
      { key: 'dashboard',      path: '/',                icon: Squares2X2Icon, roles: [] },
      { key: 'salesDashboard', path: '/sales-dashboard', icon: ChartBarIcon,   roles: ['SUPER_ADMIN', 'BRANCH_MANAGER'] },
      { key: 'salesOrders',    path: '/sales-orders',    icon: DocumentTextIcon, roles: ['SUPER_ADMIN', 'BRANCH_MANAGER'] },
    ],
  },
  {
    label: 'pos',
    items: [
      { key: 'pos',    path: '/pos',    icon: BuildingStorefrontIcon,    roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'CASHIER'] },
      { key: 'waiter', path: '/waiter', icon: UserGroupIcon,             roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'WAITER'] },
      { key: 'tables', path: '/tables', icon: Squares2X2Icon,            roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'WAITER'] },
      { key: 'deliveries', path: '/deliveries', icon: TruckIcon,         roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'DRIVER'] },
      { key: 'customers', path: '/customers', icon: IdentificationIcon,   roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'CASHIER'] },
      { key: 'kds',    path: '/kds',    icon: ClipboardDocumentListIcon, roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'KITCHEN', 'PASTRY', 'BARISTA'] },
    ],
  },
  {
    label: 'menu',
    items: [
      { key: 'catalog',    path: '/catalog',    icon: ShoppingBagIcon,    roles: [] },
      { key: 'categories', path: '/categories', icon: TagIcon,            roles: ['SUPER_ADMIN', 'BRANCH_MANAGER'] },
      { key: 'recipes',    path: '/recipes',    icon: BeakerIcon,         roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'KITCHEN', 'PASTRY'] },
      { key: 'modifiers',  path: '/modifiers',  icon: ClipboardDocumentCheckIcon, roles: ['SUPER_ADMIN', 'BRANCH_MANAGER'] },
      { key: 'promotions', path: '/promotions', icon: TagIcon,            roles: ['SUPER_ADMIN', 'BRANCH_MANAGER'] },
      { key: 'pricing',    path: '/pricing',    icon: CurrencyDollarIcon, roles: ['SUPER_ADMIN', 'PROCUREMENT'] },
    ],
  },
  {
    label: 'inventory',
    items: [
      { key: 'inventory',    path: '/inventory',    icon: ArchiveBoxIcon,            roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'PROCUREMENT', 'WAREHOUSE'] },
      { key: 'stockCount',   path: '/stock-count',  icon: ClipboardDocumentCheckIcon, roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE'] },
      { key: 'production',   path: '/production',   icon: FireIcon,                  roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'KITCHEN', 'PASTRY', 'WAREHOUSE'] },
      { key: 'requisitions', path: '/requisitions', icon: ClipboardDocumentListIcon, roles: [] },
      { key: 'transfers',    path: '/transfers',    icon: ArrowsRightLeftIcon,       roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'PROCUREMENT', 'WAREHOUSE'] },
      { key: 'wastage',      path: '/wastage',      icon: TrashIcon,                 roles: [] },
    ],
  },
  {
    label: 'purchasing',
    items: [
      { key: 'suppliers',      path: '/suppliers',       icon: TruckIcon,        roles: ['SUPER_ADMIN', 'PROCUREMENT', 'WAREHOUSE'] },
      { key: 'purchaseOrders', path: '/purchase-orders', icon: DocumentTextIcon, roles: ['SUPER_ADMIN', 'PROCUREMENT', 'WAREHOUSE'] },
    ],
  },
  {
    label: 'team',
    items: [
      { key: 'staffTasks', path: '/staff-tasks', icon: ClipboardDocumentCheckIcon, roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'CLEANER', 'WAREHOUSE'] },
      { key: 'users',      path: '/users',       icon: UsersIcon,                  roles: ['SUPER_ADMIN', 'BRANCH_MANAGER'] },
    ],
  },
  {
    label: 'insights',
    items: [
      { key: 'reports',       path: '/reports',       icon: ChartBarIcon,                roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'PROCUREMENT'] },
      { key: 'salesHistory',  path: '/sales-history', icon: DocumentTextIcon,            roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'CASHIER'] },
      { key: 'alerts',        path: '/alerts',        icon: BellAlertIcon,               roles: [] },
      { key: 'notifications', path: '/notifications', icon: ChatBubbleLeftRightIcon,     roles: [] },
      { key: 'audit',         path: '/audit',         icon: DocumentMagnifyingGlassIcon, roles: ['SUPER_ADMIN'] },
    ],
  },
  {
    label: 'admin',
    items: [
      { key: 'branches', path: '/branches', icon: BuildingOffice2Icon, roles: ['SUPER_ADMIN'] },
      { key: 'units',    path: '/units',    icon: ScaleIcon,           roles: ['SUPER_ADMIN'] },
      { key: 'settings', path: '/settings', icon: Cog6ToothIcon,       roles: ['SUPER_ADMIN'] },
      { key: 'admin',    path: '/admin',    icon: ShieldCheckIcon,     roles: ['SUPER_ADMIN'] },
    ],
  },
];

export default function Layout() {
  const { user, logout, updateLanguage, activeBranch, isAllBranches, switchBranch, selectAllBranches } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [branchDropdown, setBranchDropdown] = useState(false);
  const isRTL = i18n.language === 'ar';

  // Real-time audible + popup notifications, scoped to the active branch.
  useNotificationSounds(activeBranch?.id);

  // Per-device sound mute (does not change the global admin config).
  const [soundMuted, setSoundMuted] = useState(() => localStorage.getItem('sound_muted') === 'true');
  const toggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    localStorage.setItem('sound_muted', String(next));
    unlockAudio();
  };

  // Dark mode toggle (persisted locally; synced to backend via Settings page).
  const [dark, setDark] = useState(() => loadThemeLocal().dark);
  const toggleDark = () => setDark(toggleDarkMode());

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const { data: allBranchesList } = useQuery({
    queryKey: ['branches-switcher'],
    queryFn: () => api.get('/branches').then(r => r.data.data),
    enabled: isSuperAdmin,
    staleTime: 60000,
  });
  const switcherBranches = isSuperAdmin ? (allBranchesList || []) : (user?.assignedBranches || []);

  const { data: alertsData } = useQuery({
    queryKey: ['alerts-count', activeBranch?.id ?? 'all'],
    queryFn: () => api.get('/alerts', { params: activeBranch?.id ? { branchId: activeBranch.id } : {} }).then(r => r.data.data),
    refetchInterval: 60000,
  });
  const unreadAlerts = alertsData?.filter((a: any) => !a.isRead).length || 0;

  const { data: notifCount } = useQuery({
    queryKey: ['notif-unread-count'],
    queryFn: () => api.get('/notifications/unread-count').then(r => r.data.data),
    refetchInterval: 15000,
  });
  const unreadNotifs = notifCount?.count || 0;

  const handleLogout = () => { logout(); navigate('/login'); };
  const toggleLang = () => updateLanguage(i18n.language === 'ar' ? 'en' : 'ar');

  const role = user?.role || '';
  // Build visible sections (a section is dropped if it has no visible items).
  const visibleSections = NAV_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter((n) => n.roles.length === 0 || n.roles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);

  const displayName = isRTL && user?.firstNameAr ? `${user.firstNameAr} ${user.lastNameAr}` : `${user?.firstName} ${user?.lastName}`;
  const branchName = isRTL && activeBranch?.nameAr ? activeBranch.nameAr : activeBranch?.name;
  const hasMultipleBranches = (user?.assignedBranches?.length || 0) > 1 || user?.role === 'SUPER_ADMIN';

  const badge = (n: number) => (
    <span className="ms-auto bg-destructive text-white text-xs font-semibold rounded-full min-w-5 h-5 px-1 flex items-center justify-center nums">
      {n > 9 ? '9+' : n}
    </span>
  );

  return (
    <div className={`flex h-screen overflow-hidden bg-bg text-fg ${isRTL ? 'font-arabic' : 'font-sans'}`}>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-slate-950/60 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 z-30 w-64 bg-primary text-primary-fg flex flex-col transform transition-transform duration-300 lg:translate-x-0
          ${isRTL ? 'right-0' : 'left-0'}
          ${sidebarOpen ? 'translate-x-0' : (isRTL ? 'translate-x-full' : '-translate-x-full')}`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
              <BuildingStorefrontIcon className="w-5 h-5 text-accent-fg" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold leading-tight truncate">{t('app.name')}</h1>
              <p className="text-xs text-white/50 truncate">{t('app.tagline')}</p>
            </div>
          </div>
          <button className="lg:hidden text-white/60 hover:text-white" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-3 scrollbar-hide">
          {visibleSections.map((section) => (
            <div key={section.label}>
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/35">
                {t(`navGroups.${section.label}`)}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === '/'}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-theme
                        ${isActive ? 'bg-accent text-accent-fg shadow-elev-sm' : 'text-white/70 hover:bg-white/10 hover:text-white'}`
                      }
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      <span className="truncate">{t(`nav.${item.key}`)}</span>
                      {item.key === 'alerts' && unreadAlerts > 0 && badge(unreadAlerts)}
                      {item.key === 'notifications' && unreadNotifs > 0 && badge(unreadNotifs)}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-sm font-bold flex-shrink-0 text-accent-fg">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{displayName}</p>
              <p className="text-xs text-white/50">{t(`roles.${user?.role}`)}</p>
              {(isAllBranches || branchName) && <p className="text-xs text-white/40 truncate">{isAllBranches ? t('dashboard.allBranches') : branchName}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={toggleLang} className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded-lg px-2 py-1.5 transition-theme">
              <GlobeAltIcon className="w-4 h-4" />{i18n.language === 'ar' ? 'English' : 'عربي'}
            </button>
            <button onClick={handleLogout} className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-destructive/20 hover:bg-destructive/40 text-red-200 hover:text-white rounded-lg px-2 py-1.5 transition-theme">
              <ArrowRightOnRectangleIcon className="w-4 h-4" />{t('auth.logout')}
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-surface border-b border-border flex items-center justify-between px-4 flex-shrink-0 shadow-elev-sm no-print">
          <button className="lg:hidden text-fg-muted hover:text-fg p-1" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Bars3Icon className="w-6 h-6" />
          </button>
          <div className="text-sm text-fg-muted hidden sm:block">
            {t('auth.welcome')}, <span className="font-semibold text-fg">{user?.firstName}</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {hasMultipleBranches && (
              <div className="relative">
                <button
                  onClick={() => setBranchDropdown(!branchDropdown)}
                  className="flex items-center gap-1.5 text-xs bg-accent-subtle text-accent-subtle-fg px-3 py-1.5 rounded-full font-medium hover:opacity-90 transition-theme"
                >
                  <BuildingOffice2Icon className="w-4 h-4" />
                  <span className="max-w-[8rem] truncate">{isAllBranches ? t('dashboard.allBranches') : (branchName || t('dashboard.allBranches'))}</span>
                  <ChevronDownIcon className="w-3 h-3" />
                </button>
                {branchDropdown && (
                  <div className="absolute end-0 top-full mt-1 bg-surface border border-border rounded-xl shadow-elev-lg z-50 min-w-48 py-1">
                    <button
                      onClick={() => { selectAllBranches(); setBranchDropdown(false); }}
                      className={`w-full text-start px-4 py-2 text-sm hover:bg-surface-2 border-b border-border flex items-center gap-2 ${isAllBranches ? 'text-accent font-medium' : 'text-fg'}`}
                    >
                      <GlobeAltIcon className="w-4 h-4" />{t('dashboard.allBranches')}
                    </button>
                    {switcherBranches.map((b: any) => (
                      <button
                        key={b.id}
                        onClick={() => { switchBranch(b.id); setBranchDropdown(false); }}
                        className={`w-full text-start px-4 py-2 text-sm hover:bg-surface-2 flex items-center gap-2 ${!isAllBranches && activeBranch?.id === b.id ? 'text-accent font-medium' : 'text-fg'}`}
                      >
                        {b.isWarehouse ? <ArchiveBoxIcon className="w-4 h-4" /> : <BuildingStorefrontIcon className="w-4 h-4" />}
                        {isRTL ? b.nameAr : b.name}
                        {b.isPrimary && <span className="text-xs text-fg-subtle ms-1">(primary)</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!hasMultipleBranches && branchName && (
              <span className="hidden sm:block text-xs bg-accent-subtle text-accent-subtle-fg px-2 py-1 rounded-full font-medium">{branchName}</span>
            )}

            <button
              onClick={toggleDark}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle dark mode"
              className="text-fg-muted hover:text-fg p-1.5 rounded-lg hover:bg-surface-2 transition-theme"
            >
              {dark ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            </button>

            <button
              onClick={toggleSound}
              title={soundMuted ? t('sound.unmute') : t('sound.mute')}
              aria-label={soundMuted ? t('sound.unmute') : t('sound.mute')}
              className="text-fg-muted hover:text-fg p-1.5 rounded-lg hover:bg-surface-2 transition-theme"
            >
              {soundMuted ? <BellSlashIcon className="w-5 h-5" /> : <BellIcon className="w-5 h-5" />}
            </button>

            <span className="hidden sm:inline-block text-xs bg-surface-2 text-fg-muted px-2 py-1 rounded-full">{t(`roles.${user?.role}`)}</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
