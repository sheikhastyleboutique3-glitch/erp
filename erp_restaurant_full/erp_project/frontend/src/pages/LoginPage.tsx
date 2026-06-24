import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try { await login(email, password); navigate('/'); }
    catch (err: any) { toast.error(err?.response?.data?.message || err?.message || 'Login failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8"><h1 className="text-3xl font-bold text-white">GWK V7</h1><p className="text-brand-200 text-sm mt-1">{t('auth.subtitle')}</p></div>
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1.5">{t('auth.email')}</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="you@company.com" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1.5">{t('auth.password')}</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="Enter your password" /></div>
          <button type="submit" disabled={loading} className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white font-semibold py-3 rounded-xl transition-colors">{loading ? 'Signing in...' : t('auth.login')}</button>
        </form>
      </div>
    </div>
  );
}
