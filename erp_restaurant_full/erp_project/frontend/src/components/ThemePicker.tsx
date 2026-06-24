import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../lib/api';
import {
  THEME_PRESETS, FONT_STACKS, DEFAULT_THEME, type ThemeState, type ThemeFont,
  applyTheme, saveThemeLocal, themeToSettings, resolveRamp,
} from '../lib/theme';

/**
 * Appearance / theme picker. Lets an admin choose a ready preset or build a
 * manual theme. Changes preview live (applyTheme) and persist to Settings.
 */
export default function ThemePicker({ initial }: { initial?: Partial<ThemeState> }) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const qc = useQueryClient();
  const [theme, setTheme] = useState<ThemeState>({ ...DEFAULT_THEME, ...initial });

  const update = (patch: Partial<ThemeState>) => {
    const next = { ...theme, ...patch };
    setTheme(next);
    applyTheme(next);       // live preview
    saveThemeLocal(next);   // instant persistence (no flash on reload)
  };

  const save = useMutation({
    mutationFn: () => api.post('/settings/bulk', { settings: themeToSettings(theme) }),
    onSuccess: () => { toast.success(t('common.save') + ' ✓'); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const fonts: { id: ThemeFont; label: string }[] = [
    { id: 'inter', label: 'Inter' },
    { id: 'cairo', label: 'Cairo (عربي)' },
    { id: 'system', label: 'System' },
  ];
  const ramp = resolveRamp(theme);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
        <h3 className="font-semibold text-gray-900">🎨 {t('theme.title')}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{t('theme.subtitle')}</p>
      </div>
      <div className="p-5 space-y-6">
        {/* Mode toggle */}
        <div className="inline-flex rounded-xl border border-gray-200 p-1 bg-gray-50">
          {(['preset', 'manual'] as const).map(m => (
            <button key={m} onClick={() => update({ mode: m })}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition ${theme.mode === m ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {t(`theme.${m}`)}
            </button>
          ))}
        </div>

        {/* Light / Dark appearance toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('theme.appearance') !== 'theme.appearance' ? t('theme.appearance') : 'Appearance'}</label>
          <div className="inline-flex rounded-xl border border-gray-200 p-1 bg-gray-50">
            {([['light', '☀️ Light'], ['dark', '🌙 Dark']] as const).map(([m, label]) => {
              const active = (m === 'dark') === theme.dark;
              return (
                <button key={m} onClick={() => update({ dark: m === 'dark' })}
                  className={`px-4 py-1.5 text-sm font-medium rounded-lg transition ${active ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Preset grid */}
        {theme.mode === 'preset' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {THEME_PRESETS.map(p => {
              const active = theme.preset === p.id;
              return (
                <button key={p.id} onClick={() => update({ preset: p.id })}
                  className={`group rounded-xl border-2 p-3 text-start transition ${active ? 'border-brand-600 ring-2 ring-brand-200' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex gap-1 mb-2">
                    {[300, 500, 600, 800].map(s => (
                      <span key={s} className="h-5 flex-1 rounded" style={{ background: p.ramp[s] }} />
                    ))}
                  </div>
                  <div className="text-sm font-medium text-gray-800">{isRTL ? p.nameAr : p.name}</div>
                </button>
              );
            })}
          </div>
        )}

        {/* Manual color */}
        {theme.mode === 'manual' && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">{t('theme.baseColor')}</label>
            <div className="flex items-center gap-3">
              <input type="color" value={theme.primary} onChange={e => update({ primary: e.target.value })}
                className="w-12 h-12 rounded-lg border border-gray-200 cursor-pointer" />
              <input value={theme.primary} onChange={e => update({ primary: e.target.value })}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono" />
            </div>
            <div className="flex gap-1">
              {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map(s => (
                <div key={s} className="flex-1 h-8 rounded" title={`${s}: ${ramp[s]}`} style={{ background: ramp[s] }} />
              ))}
            </div>
            <p className="text-xs text-gray-500">{t('theme.rampHint')}</p>
          </div>
        )}

        {/* Font */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('theme.font')}</label>
          <div className="flex flex-wrap gap-2">
            {fonts.map(f => (
              <button key={f.id} onClick={() => update({ font: f.id })}
                style={{ fontFamily: FONT_STACKS[f.id] }}
                className={`px-4 py-2 rounded-xl border text-sm ${theme.font === f.id ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Live preview strip */}
        <div className="rounded-xl border border-gray-100 p-4 bg-gray-50">
          <div className="text-xs text-gray-500 mb-2">{t('theme.preview')}</div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-medium">{t('common.save')}</button>
            <span className="bg-brand-100 text-brand-700 px-3 py-1 rounded-full text-xs font-medium">Badge</span>
            <a className="text-brand-600 text-sm font-medium underline">Link</a>
            <span className="border-2 border-brand-600 text-brand-600 px-3 py-1.5 rounded-xl text-sm">Outline</span>
          </div>
        </div>

        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white font-semibold py-3 rounded-xl">
          {save.isPending ? t('common.saving') : t('theme.apply')}
        </button>
      </div>
    </div>
  );
}
