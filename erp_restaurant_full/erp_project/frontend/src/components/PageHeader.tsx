import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

interface Props { title: string; subtitle?: string; actions?: ReactNode; backTo?: string; }

export default function PageHeader({ title, subtitle, actions, backTo }: Props) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        {backTo && (
          <button
            onClick={() => navigate(backTo)}
            aria-label="Back"
            className="p-2 rounded-lg hover:bg-surface-2 text-fg-muted hover:text-fg transition-theme rtl:rotate-180"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-fg tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-sm text-fg-muted mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
