import { useEffect, useRef } from 'react';

interface SlideDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

/**
 * Right-side slide-out drawer — works correctly in both LTR (English) and RTL (Arabic).
 *
 * RTL fix:
 *   - In LTR: drawer is anchored to the RIGHT  (right: 0)  and slides in from the right.
 *             Closed state = translate-x-full  (off-screen right)
 *   - In RTL: drawer is anchored to the LEFT   (left: 0)   and slides in from the left.
 *             Closed state = -translate-x-full (off-screen left)
 *
 * We detect RTL by reading document.documentElement.dir which is set by AuthContext
 * whenever the language changes.
 */
export default function SlideDrawer({ open, onClose, title, children, width = 'w-[520px]' }: SlideDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const isRTL = document.documentElement.dir === 'rtl';

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // In RTL the drawer slides from the LEFT; in LTR from the RIGHT.
  const anchorClass = isRTL ? 'left-0' : 'right-0';
  const closedTranslate = isRTL ? '-translate-x-full' : 'translate-x-full';

  return (
    <>
      {/* Backdrop — only interactive when open */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          'fixed top-0 h-full bg-white shadow-2xl z-50 flex flex-col',
          'transform transition-transform duration-300 ease-in-out',
          width,
          'max-w-full',
          anchorClass,
          open ? 'translate-x-0' : closedTranslate,
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0 bg-gray-50">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
            aria-label="Close drawer"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </>
  );
}
