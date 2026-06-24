/**
 * Theme engine — ready presets + manual theme picker.
 *
 * A theme = a full brand color ramp (50..900) + font family, applied by
 * setting the --color-brand-* CSS variables that tailwind.config.js binds to.
 * Selection is persisted to localStorage (instant paint, no flash) AND to the
 * backend Settings store (group `branding`) so it is shared across devices.
 *
 * Keys saved to Settings:
 *   theme_mode    : 'preset' | 'manual'
 *   theme_preset  : preset id (when mode === 'preset')
 *   theme_primary : base hex color (when mode === 'manual')
 *   theme_font    : 'inter' | 'cairo' | 'system'
 */

export type BrandRamp = Record<number, string>;

export interface ThemePreset {
  id: string;
  name: string;
  nameAr: string;
  /** swatch shown in the picker (usually the 600 shade) */
  swatch: string;
  ramp: BrandRamp;
}

export type ThemeFont = 'inter' | 'cairo' | 'system';

export interface ThemeState {
  mode: 'preset' | 'manual';
  preset: string;
  primary: string;
  font: ThemeFont;
  /** Dark mode toggle — adds/removes the `.dark` class on <html>. */
  dark: boolean;
}

export const FONT_STACKS: Record<ThemeFont, string> = {
  inter: "'Inter', system-ui, sans-serif",
  cairo: "'Cairo', system-ui, sans-serif",
  system: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
};

/** Ready-made presets (full ramps, hand-tuned from Tailwind palettes). */
export const THEME_PRESETS: ThemePreset[] = [
  { id: 'swiss', name: 'Swiss Pro', nameAr: 'سويسري', swatch: '#0369a1', ramp: {
    50:'#f0f9ff',100:'#e0f2fe',200:'#bae6fd',300:'#7dd3fc',400:'#38bdf8',500:'#0ea5e9',600:'#0369a1',700:'#075985',800:'#0c4a6e',900:'#0f172a' } },
  { id: 'blue', name: 'Ocean Blue', nameAr: 'أزرق المحيط', swatch: '#2563eb', ramp: {
    50:'#eff6ff',100:'#dbeafe',200:'#bfdbfe',300:'#93c5fd',400:'#60a5fa',500:'#3b82f6',600:'#2563eb',700:'#1d4ed8',800:'#1e40af',900:'#1e3a8a' } },
  { id: 'emerald', name: 'Emerald', nameAr: 'زمردي', swatch: '#059669', ramp: {
    50:'#ecfdf5',100:'#d1fae5',200:'#a7f3d0',300:'#6ee7b7',400:'#34d399',500:'#10b981',600:'#059669',700:'#047857',800:'#065f46',900:'#064e3b' } },
  { id: 'amber', name: 'Amber', nameAr: 'كهرماني', swatch: '#d97706', ramp: {
    50:'#fffbeb',100:'#fef3c7',200:'#fde68a',300:'#fcd34d',400:'#fbbf24',500:'#f59e0b',600:'#d97706',700:'#b45309',800:'#92400e',900:'#78350f' } },
  { id: 'rose', name: 'Rose', nameAr: 'وردي', swatch: '#e11d48', ramp: {
    50:'#fff1f2',100:'#ffe4e6',200:'#fecdd3',300:'#fda4af',400:'#fb7185',500:'#f43f5e',600:'#e11d48',700:'#be123c',800:'#9f1239',900:'#881337' } },
  { id: 'violet', name: 'Violet', nameAr: 'بنفسجي', swatch: '#7c3aed', ramp: {
    50:'#f5f3ff',100:'#ede9fe',200:'#ddd6fe',300:'#c4b5fd',400:'#a78bfa',500:'#8b5cf6',600:'#7c3aed',700:'#6d28d9',800:'#5b21b6',900:'#4c1d95' } },
  { id: 'teal', name: 'Teal', nameAr: 'تركوازي', swatch: '#0d9488', ramp: {
    50:'#f0fdfa',100:'#ccfbf1',200:'#99f6e4',300:'#5eead4',400:'#2dd4bf',500:'#14b8a6',600:'#0d9488',700:'#0f766e',800:'#115e59',900:'#134e4a' } },
  { id: 'slate', name: 'Graphite', nameAr: 'رمادي', swatch: '#475569', ramp: {
    50:'#f8fafc',100:'#f1f5f9',200:'#e2e8f0',300:'#cbd5e1',400:'#94a3b8',500:'#64748b',600:'#475569',700:'#334155',800:'#1e293b',900:'#0f172a' } },
  { id: 'crimson', name: 'Crimson', nameAr: 'قرمزي', swatch: '#dc2626', ramp: {
    50:'#fef2f2',100:'#fee2e2',200:'#fecaca',300:'#fca5a5',400:'#f87171',500:'#ef4444',600:'#dc2626',700:'#b91c1c',800:'#991b1b',900:'#7f1d1d' } },
];

export const DEFAULT_THEME: ThemeState = { mode: 'preset', preset: 'swiss', primary: '#0369a1', font: 'inter', dark: false };

/** True when the OS currently prefers a dark color scheme. */
export function prefersDark(): boolean {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
}

const LS_KEY = 'erp_theme';

/* ---- hex helpers ---- */
function clamp(n: number) { return Math.max(0, Math.min(255, Math.round(n))); }
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim();
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const int = parseInt(v.padEnd(6, '0').slice(0, 6), 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}
function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map(x => clamp(x).toString(16).padStart(2, '0')).join('');
}
function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Generate a full 50..900 ramp from a single base color (used in manual mode). */
export function hexToRamp(base: string): BrandRamp {
  const rgb = hexToRgb(base);
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [15, 23, 42]; // slate-900-ish, avoids muddy pure black
  // base color anchors at 600
  const lightSteps: Record<number, number> = { 50: 0.95, 100: 0.88, 200: 0.74, 300: 0.56, 400: 0.34, 500: 0.16 };
  const darkSteps: Record<number, number> = { 700: 0.18, 800: 0.34, 900: 0.5 };
  const ramp: BrandRamp = { 600: rgbToHex(...rgb) };
  for (const [k, t] of Object.entries(lightSteps)) { const c = mix(rgb, white, t); ramp[+k] = rgbToHex(...c); }
  for (const [k, t] of Object.entries(darkSteps)) { const c = mix(rgb, black, t); ramp[+k] = rgbToHex(...c); }
  return ramp;
}

export function resolveRamp(theme: ThemeState): BrandRamp {
  if (theme.mode === 'manual') return hexToRamp(theme.primary);
  return (THEME_PRESETS.find(p => p.id === theme.preset) || THEME_PRESETS[0]).ramp;
}

/** Apply a theme to the document immediately. */
export function applyTheme(theme: ThemeState) {
  const ramp = resolveRamp(theme);
  const root = document.documentElement;
  for (const shade of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
    if (ramp[shade]) root.style.setProperty(`--color-brand-${shade}`, ramp[shade]);
  }

  // Drive the semantic accent/ring tokens from the chosen ramp so the WHOLE app
  // (buttons, links, focus rings, active chips, badges) adopts the theme — not
  // just the legacy brand-* utilities. A lighter shade is used in dark mode so
  // accents stay legible on the dark canvas.
  const dark = !!theme.dark;
  const setVar = (name: string, val?: string) => { if (val) root.style.setProperty(name, val); };
  setVar('--accent',           dark ? ramp[400] : ramp[600]);
  setVar('--accent-hover',     dark ? ramp[300] : ramp[700]);
  setVar('--accent-active',    dark ? ramp[200] : ramp[800]);
  setVar('--accent-fg',        dark ? '#0b1220' : '#ffffff');
  setVar('--accent-subtle',    dark ? ramp[800] : ramp[100]);
  setVar('--accent-subtle-fg', dark ? ramp[100] : ramp[700]);
  setVar('--ring',             dark ? ramp[400] : ramp[600]);

  if (theme.font && FONT_STACKS[theme.font]) root.style.setProperty('--font-family', FONT_STACKS[theme.font]);
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
}

export function saveThemeLocal(theme: ThemeState) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(theme)); } catch { /* ignore */ }
}

export function loadThemeLocal(): ThemeState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_THEME, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  // No saved preference yet → follow the OS color scheme.
  return { ...DEFAULT_THEME, dark: prefersDark() };
}

/** Build a ThemeState from a settings key/value map (group `branding`). */
export function themeFromSettings(map: Record<string, string>): ThemeState {
  return {
    mode: (map.theme_mode === 'manual' ? 'manual' : 'preset'),
    preset: map.theme_preset || DEFAULT_THEME.preset,
    primary: map.theme_primary || map.primary_color || DEFAULT_THEME.primary,
    font: (['inter', 'cairo', 'system'].includes(map.theme_font) ? map.theme_font : DEFAULT_THEME.font) as ThemeFont,
    dark: map.theme_dark != null ? map.theme_dark === 'true' : prefersDark(),
  };
}

/** Convert ThemeState to settings rows for POST /settings/bulk. */
export function themeToSettings(theme: ThemeState): { key: string; value: string; group: string }[] {
  const ramp = resolveRamp(theme);
  return [
    { key: 'theme_mode', value: theme.mode, group: 'branding' },
    { key: 'theme_preset', value: theme.preset, group: 'branding' },
    { key: 'theme_primary', value: theme.mode === 'manual' ? theme.primary : (ramp[600] || theme.primary), group: 'branding' },
    { key: 'theme_font', value: theme.font, group: 'branding' },
    { key: 'theme_dark', value: String(theme.dark), group: 'branding' },
    // keep legacy keys in sync so older readers still work
    { key: 'primary_color', value: ramp[600] || theme.primary, group: 'branding' },
    { key: 'secondary_color', value: ramp[500] || theme.primary, group: 'branding' },
  ];
}

/** Apply the locally-saved theme synchronously (call before React renders). */
export function bootstrapTheme() { applyTheme(loadThemeLocal()); }

/** Toggle dark mode, persist locally, and apply immediately. Returns new state. */
export function toggleDarkMode(): boolean {
  const theme = loadThemeLocal();
  const next = { ...theme, dark: !theme.dark };
  applyTheme(next);
  saveThemeLocal(next);
  return next.dark;
}
