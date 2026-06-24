/**
 * Native OS notification helper (progressive enhancement).
 *
 * On top of the in-app clickable toast, we also surface a real system
 * notification when the browser allows it. This gives a visible popup even when
 * the ERP tab is in the background.
 *
 * Platform support:
 *  - Desktop Chrome/Edge/Firefox/Safari and Android Chrome: full support.
 *  - iOS Safari: only when the app is installed to the Home Screen as a PWA
 *    (iOS 16.4+). In a normal Safari tab the in-app toast + sound still fire.
 */

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Ask for OS notification permission once (best-effort, never throws). */
export function ensureNotificationPermission(): void {
  try {
    if (!notificationsSupported()) return;
    if (Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

/**
 * Show a system notification. Clicking it focuses the app and runs `onClick`
 * (used to deep-link to the related requisition / purchase order).
 */
export function showSystemNotification(opts: {
  title: string;
  body: string;
  tag?: string;
  onClick?: () => void;
}): void {
  try {
    if (!notificationsSupported()) return;
    if (Notification.permission !== 'granted') return;
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      opts.onClick?.();
      n.close();
    };
  } catch {
    /* ignore */
  }
}
