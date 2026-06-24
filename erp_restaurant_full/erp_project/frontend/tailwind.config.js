/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Legacy brand ramp (interactive accent). Re-skinned to MASTER sky+navy
        // so existing brand-* usages adopt the new palette automatically.
        brand: {
          50:  'var(--color-brand-50, #f0f9ff)',
          100: 'var(--color-brand-100, #e0f2fe)',
          200: 'var(--color-brand-200, #bae6fd)',
          300: 'var(--color-brand-300, #7dd3fc)',
          400: 'var(--color-brand-400, #38bdf8)',
          500: 'var(--color-brand-500, #0ea5e9)',
          600: 'var(--color-brand-600, #0369a1)',
          700: 'var(--color-brand-700, #075985)',
          800: 'var(--color-brand-800, #0c4a6e)',
          900: 'var(--color-brand-900, #0f172a)',
        },

        // Semantic tokens (auto light/dark via CSS variables in index.css).
        bg: 'var(--bg)',
        surface: {
          DEFAULT: 'var(--surface)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        fg: {
          DEFAULT: 'var(--fg)',
          muted: 'var(--fg-muted)',
          subtle: 'var(--fg-subtle)',
        },
        border: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          fg: 'var(--primary-fg)',
        },
        secondary: 'var(--secondary)',
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          active: 'var(--accent-active)',
          fg: 'var(--accent-fg)',
          subtle: 'var(--accent-subtle)',
          'subtle-fg': 'var(--accent-subtle-fg)',
        },
        ring: 'var(--ring)',
        success: { DEFAULT: 'var(--success)', subtle: 'var(--success-subtle)' },
        warning: { DEFAULT: 'var(--warning)', subtle: 'var(--warning-subtle)' },
        destructive: { DEFAULT: 'var(--destructive)', subtle: 'var(--destructive-subtle)' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        arabic: ['Cairo', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'elev-sm': 'var(--shadow-sm)',
        'elev-md': 'var(--shadow-md)',
        'elev-lg': 'var(--shadow-lg)',
        'elev-xl': 'var(--shadow-xl)',
      },
      ringColor: { DEFAULT: 'var(--ring)' },
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        shimmer: 'shimmer 1.4s infinite',
      },
    },
  },
  plugins: [],
};
