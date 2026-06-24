import { ComponentType, ReactNode } from 'react';

/**
 * StatsCard — reusable metric card for dashboards (Swiss-minimalist).
 *
 * `icon` accepts either a Heroicon/Lucide component (preferred) or any node
 * (kept backward-compatible with existing emoji/string usages). Colors are
 * tone variants that work in both light and dark mode.
 */

type Tone = 'blue' | 'indigo' | 'purple' | 'green' | 'yellow' | 'orange' | 'red' | 'gray' | 'accent';

const TONE: Record<Tone, { iconWrap: string; value: string }> = {
  accent: { iconWrap: 'bg-accent-subtle text-accent', value: 'text-fg' },
  blue:   { iconWrap: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300', value: 'text-fg' },
  indigo: { iconWrap: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300', value: 'text-fg' },
  purple: { iconWrap: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300', value: 'text-fg' },
  green:  { iconWrap: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', value: 'text-fg' },
  yellow: { iconWrap: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', value: 'text-fg' },
  orange: { iconWrap: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300', value: 'text-fg' },
  red:    { iconWrap: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300', value: 'text-fg' },
  gray:   { iconWrap: 'bg-surface-2 text-fg-muted', value: 'text-fg' },
};

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: ComponentType<{ className?: string }> | ReactNode;
  color: Tone;
  subtitle?: string;
  onClick?: () => void;
}

export default function StatsCard({ title, value, icon, color, subtitle, onClick }: StatsCardProps) {
  const c = TONE[color] ?? TONE.accent;
  const Icon = typeof icon === 'function' ? (icon as ComponentType<{ className?: string }>) : null;
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      className={`bg-surface rounded-xl p-4 border border-border shadow-elev-sm transition-theme ${
        onClick ? 'cursor-pointer hover:shadow-elev-md hover:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0 ${c.iconWrap}`}>
          {Icon ? <Icon className="w-5 h-5" /> : (icon as ReactNode)}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-fg-muted truncate">{title}</p>
          <p className={`text-2xl font-bold nums ${c.value}`}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {subtitle && <p className="text-xs text-fg-subtle mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
