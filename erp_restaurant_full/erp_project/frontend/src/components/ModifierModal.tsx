import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface ModOption {
  id: number;
  name: string;
  nameAr?: string | null;
  priceDelta: number;
  componentProductId?: number | null;
  qtyToDeduct?: number;
}
export interface ModGroup {
  id: number;
  name: string;
  nameAr?: string | null;
  minSelect: number;
  maxSelect: number;
  required: boolean;
  options: ModOption[];
}
export interface ChosenModifier {
  optionId: number;
  name: string;
  priceDelta: number;
  componentProductId?: number | null;
  qtyToDeduct?: number;
}

/**
 * Modal to pick modifiers for a product before adding it to the order.
 * Enforces required groups and max-select; reports chosen options + price delta.
 */
export default function ModifierModal({
  product,
  groups,
  onClose,
  onConfirm,
}: {
  product: any;
  groups: ModGroup[];
  onClose: () => void;
  onConfirm: (mods: ChosenModifier[], priceDelta: number) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Record<number, number[]>>({});

  const toggle = (group: ModGroup, optionId: number) => {
    setSelected((prev) => {
      const cur = prev[group.id] ?? [];
      if (group.maxSelect === 1) return { ...prev, [group.id]: [optionId] };
      if (cur.includes(optionId)) return { ...prev, [group.id]: cur.filter((x) => x !== optionId) };
      if (group.maxSelect > 0 && cur.length >= group.maxSelect) return prev; // at cap
      return { ...prev, [group.id]: [...cur, optionId] };
    });
  };

  const { chosen, priceDelta, canConfirm } = useMemo(() => {
    const all: ChosenModifier[] = [];
    let delta = 0;
    let ok = true;
    for (const g of groups) {
      const ids = selected[g.id] ?? [];
      const need = Math.max(g.minSelect, g.required ? 1 : 0);
      if (ids.length < need) ok = false;
      for (const id of ids) {
        const opt = g.options.find((o) => o.id === id);
        if (opt) {
          all.push({ optionId: opt.id, name: opt.name, priceDelta: opt.priceDelta, componentProductId: opt.componentProductId, qtyToDeduct: opt.qtyToDeduct });
          delta += opt.priceDelta;
        }
      }
    }
    return { chosen: all, priceDelta: delta, canConfirm: ok };
  }, [groups, selected]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div className="font-semibold text-sm">{product.name}</div>
          <button onClick={onClose} className="text-gray-400 text-lg" aria-label="Close">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {groups.map((g) => {
            const ids = selected[g.id] ?? [];
            const need = Math.max(g.minSelect, g.required ? 1 : 0);
            const unmet = ids.length < need;
            return (
              <div key={g.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium">{g.name}</span>
                  <span className={`text-[11px] ${unmet ? 'text-red-600' : 'text-gray-400'}`}>
                    {g.maxSelect === 1 ? t('modifiers.pickOne') : g.maxSelect > 0 ? t('modifiers.pickUpTo', { n: g.maxSelect }) : t('modifiers.pickAny')}
                    {need > 0 ? ` · ${t('modifiers.required')}` : ''}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {g.options.map((o) => {
                    const on = ids.includes(o.id);
                    return (
                      <button
                        key={o.id}
                        onClick={() => toggle(g, o.id)}
                        className={`text-left px-3 py-2 rounded-lg border text-sm transition ${on ? 'bg-primary text-white border-primary' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}
                      >
                        <span>{o.name}</span>
                        {o.priceDelta ? <span className="block text-xs opacity-80">+{o.priceDelta.toFixed(2)}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-gray-900 px-4 py-3 border-t border-gray-200 dark:border-gray-800">
          <button
            disabled={!canConfirm}
            onClick={() => onConfirm(chosen, priceDelta)}
            className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50"
          >
            {t('modifiers.addToOrder')}{priceDelta ? ` (+${priceDelta.toFixed(2)})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
