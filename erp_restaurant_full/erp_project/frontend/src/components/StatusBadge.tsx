import { useTranslation } from 'react-i18next';

/**
 * StatusBadge — requisition / PO status pill.
 * Each status maps to a tone with explicit light + dark classes (literal
 * strings so Tailwind's JIT keeps them) for a consistent look in both modes.
 */
type Tone = { bg: string; text: string; dot: string };

const tones: Record<string, Tone> = {
  slate:   { bg: 'bg-surface-2',                            text: 'text-fg-muted',                          dot: 'bg-fg-subtle' },
  blue:    { bg: 'bg-sky-100 dark:bg-sky-500/15',           text: 'text-sky-700 dark:text-sky-300',         dot: 'bg-sky-500' },
  green:   { bg: 'bg-emerald-100 dark:bg-emerald-500/15',   text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  amber:   { bg: 'bg-amber-100 dark:bg-amber-500/15',       text: 'text-amber-700 dark:text-amber-300',     dot: 'bg-amber-500' },
  red:     { bg: 'bg-red-100 dark:bg-red-500/15',           text: 'text-red-700 dark:text-red-300',         dot: 'bg-red-500' },
  violet:  { bg: 'bg-violet-100 dark:bg-violet-500/15',     text: 'text-violet-700 dark:text-violet-300',   dot: 'bg-violet-500' },
  indigo:  { bg: 'bg-indigo-100 dark:bg-indigo-500/15',     text: 'text-indigo-700 dark:text-indigo-300',   dot: 'bg-indigo-500' },
  orange:  { bg: 'bg-orange-100 dark:bg-orange-500/15',     text: 'text-orange-700 dark:text-orange-300',   dot: 'bg-orange-500' },
};

const statusTone: Record<string, keyof typeof tones> = {
  DRAFT: 'slate',
  SUBMITTED: 'blue',
  MANAGER_APPROVED: 'green',
  MANAGER_MODIFIED: 'amber',
  MANAGER_CANCELLED: 'red',
  ORDER_PLACED_WITH_SUPPLIER: 'violet',
  RECEIVED_AT_WAREHOUSE: 'indigo',
  DISPATCHED_TO_BRANCH: 'orange',
  CONFIRMED_RECEIPT: 'green',
  SENT_TO_SUPPLIER: 'blue',
  PARTIALLY_RECEIVED: 'amber',
  FULLY_RECEIVED: 'green',
  CANCELLED: 'red',
};

export default function StatusBadge({ status, size = 'md', showDot = true }: { status: string; size?: 'sm' | 'md'; showDot?: boolean }) {
  const { t } = useTranslation();
  const tone = tones[statusTone[status] || 'slate'];
  const label = t(`requisition.status.${status}`, { defaultValue: status.replace(/_/g, ' ') });
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ${tone.bg} ${tone.text} ${sizeClass}`}>
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${tone.dot} flex-shrink-0`} />}
      {label}
    </span>
  );
}
