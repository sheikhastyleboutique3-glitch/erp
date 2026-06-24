import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import api, { clearAuth, getRefreshToken } from '../lib/api';
import i18n from '../i18n';
import type { AssignedBranch } from '../types';

export interface AuthUser {
  id: number; email: string; firstName: string; lastName: string;
  firstNameAr?: string; lastNameAr?: string;
  role: 'SUPER_ADMIN' | 'BRANCH_MANAGER' | 'PROCUREMENT' | 'WAREHOUSE' | 'KITCHEN' | 'BARISTA' | 'PASTRY' | 'CASHIER' | 'WAITER' | 'DRIVER' | 'CLEANER';
  language: string; branchId?: number;
  branch?: { id: number; name: string; nameAr: string };
  assignedBranches?: AssignedBranch[];
}

interface AuthContextType {
  user: AuthUser | null; login: (email: string, password: string) => Promise<void>;
  logout: () => void; loading: boolean; isTokenValid: () => boolean;
  updateLanguage: (lang: string) => void;
  activeBranch: { id: number; name: string; nameAr: string } | null;
  isAllBranches: boolean;
  switchBranch: (branchId: number) => Promise<void>;
  selectAllBranches: () => void;
}

function parseJwtExpiry(token: string): number | null {
  try { const payload = JSON.parse(atob(token.split('.')[1])); return typeof payload.exp === 'number' ? payload.exp * 1000 : null; } catch { return null; }
}
function applyLanguage(lang: string) { i18n.changeLanguage(lang); document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; document.documentElement.lang = lang; localStorage.setItem('language', lang); }

const AuthContext = createContext<AuthContextType>({} as AuthContextType);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeBranch, setActiveBranch] = useState<{ id: number; name: string; nameAr: string } | null>(null);
  const [isAllBranches, setIsAllBranches] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loggingInRef = useRef(false);

  const scheduleRefresh = useCallback((token: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const expiry = parseJwtExpiry(token); if (!expiry) return;
    const delay = expiry - Date.now() - 60_000; if (delay <= 0) return;
    refreshTimerRef.current = setTimeout(async () => {
      const rt = getRefreshToken(); if (!rt) return;
      try { const res = await api.post<{ data: { access_token: string } }>('/auth/refresh', { refresh_token: rt }); const newToken = res.data.data.access_token; localStorage.setItem('token', newToken); scheduleRefresh(newToken); } catch {}
    }, delay);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('user'); const token = localStorage.getItem('token');
    if (stored && token) {
      try {
        const u: AuthUser = JSON.parse(stored); setUser(u); applyLanguage(u.language || 'en'); scheduleRefresh(token);
        const scope = localStorage.getItem('branchScope');
        if (scope === 'all') { setIsAllBranches(true); setActiveBranch(null); }
        else {
          const ab = localStorage.getItem('activeBranch');
          if (ab) setActiveBranch(JSON.parse(ab));
          else if (u.branch) setActiveBranch(u.branch);
        }
      } catch { clearAuth(); }
    }
    setLoading(false);
    return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); };
  }, [scheduleRefresh]);

  const isTokenValid = useCallback((): boolean => { const token = localStorage.getItem('token'); if (!token) return false; const expiry = parseJwtExpiry(token); return expiry !== null && expiry > Date.now(); }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (loggingInRef.current) return; loggingInRef.current = true;
    try {
      const res = await api.post<{ data: { access_token: string; refresh_token: string; user: AuthUser } }>('/auth/login', { email, password });
      const { access_token, refresh_token, user: userData } = res.data.data;
      localStorage.setItem('token', access_token);
      if (refresh_token) localStorage.setItem('refresh_token', refresh_token);
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData); applyLanguage(userData.language || 'en'); scheduleRefresh(access_token);
      const branch = userData.branch || (userData.assignedBranches?.[0] ? { id: userData.assignedBranches[0].id, name: userData.assignedBranches[0].name, nameAr: userData.assignedBranches[0].nameAr } : null);
      if (branch) { setActiveBranch(branch); localStorage.setItem('activeBranch', JSON.stringify(branch)); }
    } finally { loggingInRef.current = false; }
  }, [scheduleRefresh]);

  const logout = useCallback(() => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); clearAuth(); localStorage.removeItem('activeBranch'); localStorage.removeItem('branchScope'); setUser(null); setActiveBranch(null); setIsAllBranches(false); }, []);

  const updateLanguage = useCallback((lang: string) => {
    applyLanguage(lang);
    if (user) { const updated = { ...user, language: lang }; setUser(updated); localStorage.setItem('user', JSON.stringify(updated)); }
  }, [user]);

  const switchBranch = useCallback(async (branchId: number) => {
    try {
      const res = await api.patch<{ data: any }>('/auth/switch-branch', { branchId });
      const profile = res.data.data;
      const branch = profile.branch || profile.assignedBranches?.find((b: any) => b.id === branchId);
      if (branch) { setActiveBranch({ id: branch.id, name: branch.name, nameAr: branch.nameAr }); localStorage.setItem('activeBranch', JSON.stringify({ id: branch.id, name: branch.name, nameAr: branch.nameAr })); }
      setIsAllBranches(false); localStorage.setItem('branchScope', 'branch');
      if (user) { const updated = { ...user, branchId }; setUser(updated); localStorage.setItem('user', JSON.stringify(updated)); }
    } catch (e) { console.error('Switch branch failed:', e); }
  }, [user]);

  // Select the "All Branches" scope: no branchId is sent so every page shows
  // data across all branches. Persisted so it survives reloads.
  const selectAllBranches = useCallback(() => {
    setIsAllBranches(true);
    setActiveBranch(null);
    localStorage.setItem('branchScope', 'all');
    localStorage.removeItem('activeBranch');
  }, []);

  return <AuthContext.Provider value={{ user, login, logout, loading, isTokenValid, updateLanguage, activeBranch, isAllBranches, switchBranch, selectAllBranches }}>{children}</AuthContext.Provider>;
}
