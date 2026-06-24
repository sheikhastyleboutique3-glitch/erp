/**
 * useNotificationSounds — near-real-time audible + visual notifications.
 *
 * Polls two sources on a short interval:
 *  1. The in-app notification inbox (`/notifications/inbox`) — populated by the
 *     backend for EVERY requisition / purchase-order event (created, approved,
 *     modified, cancelled, order placed, received, dispatched, confirmed, PO
 *     created / received) for every user who has permission to be notified.
 *  2. System alerts (`/alerts`) — low stock / expiry / wastage.
 *
 * For each NEW item it:
 *  - plays the per-channel chime (respecting master/per-channel/volume + device mute),
 *  - shows a CLICKABLE popup (toast) with the reason that deep-links straight to
 *    the related requisition / purchase order / alerts page,
 *  - fires a native OS notification when permitted (visible even in the background).
 *
 * Works across web, iOS Safari and Android Chrome (responsive web app). The
 * first poll only establishes a baseline so we never blast sounds on login.
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from './api';
import i18n from '../i18n';
import { playNotificationSound, unlockAudio } from './sound';
import { showSystemNotification, ensureNotificationPermission } from './webNotify';

const POLL_MS = 15_000;

interface ChannelCfg {
  enabled: boolean;
  url: string;
}
interface SoundCfg {
  enabled: boolean;
  volume: number; // 0..1
  channels: Record<string, ChannelCfg>;
}

function parseSoundSettings(rows: any[] | undefined): SoundCfg {
  const map: Record<string, string> = {};
  (rows || []).forEach((r: any) => {
    map[r.key] = r.value;
  });
  const get = (k: string, d: string) => (map[k] ?? d);
  const vol = parseInt(get('sound_volume', '70'), 10);
  return {
    enabled: get('sound_enabled', 'true') === 'true',
    volume: Math.max(0, Math.min(100, isNaN(vol) ? 70 : vol)) / 100,
    channels: {
      alerts: {
        enabled: get('sound_alerts_enabled', 'true') === 'true',
        url: get('sound_url_alerts', ''),
      },
      requisitions: {
        enabled: get('sound_requisitions_enabled', 'true') === 'true',
        url: get('sound_url_requisitions', ''),
      },
      orders: {
        enabled: get('sound_orders_enabled', 'true') === 'true',
        url: get('sound_url_orders', ''),
      },
    },
  };
}

function maxId(arr: any[] | undefined): number {
  if (!arr || !arr.length) return 0;
  return arr.reduce((m: number, x: any) => Math.max(m, x?.id || 0), 0);
}

const CHANNEL_ICON: Record<string, string> = {
  alerts: '🔔',
  requisitions: '📋',
  orders: '📝',
};

export function useNotificationSounds(branchId?: number): void {
  const navigate = useNavigate();
  const { i18n: i18nInst } = useTranslation();
  const isAr = i18nInst.language === 'ar';

  const { data: settingsRows } = useQuery({
    queryKey: ['settings', 'sound'],
    queryFn: () => api.get('/settings', { params: { group: 'sound' } }).then(r => r.data.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const cfg = parseSoundSettings(settingsRows);

  // Unlock audio + request OS notification permission on the first user gesture.
  useEffect(() => {
    const handler = () => {
      unlockAudio();
      ensureNotificationPermission();
    };
    window.addEventListener('pointerdown', handler, { once: true });
    window.addEventListener('keydown', handler, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
    };
  }, []);

  // In-app inbox — covers all requisition / PO lifecycle events for this user.
  const inboxQ = useQuery({
    queryKey: ['snd-inbox'],
    queryFn: () => api.get('/notifications/inbox', { params: { take: 30 } }).then(r => r.data.data),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });

  // System alerts (branch-scoped) — low stock / expiry / wastage.
  const params = branchId ? { branchId } : {};
  const alertsQ = useQuery({
    queryKey: ['snd-alerts', branchId ?? 'all'],
    queryFn: () => api.get('/alerts', { params }).then(r => r.data.data),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });

  // null = not yet baselined (first successful load); set after first poll.
  const baseline = useRef<Record<string, number | null>>({
    inbox: null,
    alerts: null,
  });

  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  const isMuted = () => localStorage.getItem('sound_muted') === 'true';

  // Show one notification: sound + clickable toast + OS notification.
  function present(opts: {
    channel: string;
    title: string;
    message: string;
    link?: string;
    icon?: string;
    tag?: string;
  }) {
    const c = cfgRef.current;
    if (!c.enabled || !c.channels[opts.channel]?.enabled) return;

    const go = () => {
      if (opts.link) navigate(opts.link);
    };

    // Clickable popup with the reason; tapping deep-links to the item.
    toast.custom(
      (tst) => (
        <div
          onClick={() => {
            go();
            toast.dismiss(tst.id);
          }}
          role="button"
          className={`cursor-pointer max-w-sm w-full bg-white shadow-lg rounded-xl border border-gray-200 p-3 flex items-start gap-3 hover:bg-gray-50 transition-colors ${
            tst.visible ? 'animate-enter' : 'animate-leave'
          }`}
          style={{ direction: isAr ? 'rtl' : 'ltr' }}
        >
          <span className="text-xl leading-none mt-0.5">{opts.icon || '🔔'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{opts.title}</p>
            <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{opts.message}</p>
            {opts.link && (
              <p className="text-xs text-brand-600 font-medium mt-1">
                {isAr ? 'اضغط للعرض ←' : 'Click to view →'}
              </p>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toast.dismiss(tst.id);
            }}
            className="text-gray-400 hover:text-gray-600 text-sm leading-none"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ),
      { duration: 8000 },
    );

    // Native OS popup (background-visible where supported).
    showSystemNotification({
      title: opts.title,
      body: opts.message,
      tag: opts.tag,
      onClick: go,
    });

    // Audible chime (skipped if this device is muted).
    if (!isMuted()) {
      playNotificationSound({
        channel: opts.channel,
        url: c.channels[opts.channel]?.url || undefined,
        volume: c.volume,
      });
    }
  }

  // Handle new inbox notifications (one popup per new row, oldest first).
  function handleInbox(data: any[] | undefined) {
    if (!data) return;
    const top = maxId(data);
    const prev = baseline.current.inbox;
    if (prev === null) {
      baseline.current.inbox = top;
      return;
    }
    if (top > prev) {
      const fresh = data
        .filter((n: any) => (n?.id || 0) > prev)
        .sort((a: any, b: any) => (a.id || 0) - (b.id || 0));
      baseline.current.inbox = top;
      for (const n of fresh) {
        const channel = n.channel || 'requisitions';
        present({
          channel,
          title: (isAr && n.titleAr) ? n.titleAr : n.title,
          message: (isAr && n.messageAr) ? n.messageAr : n.message,
          link: n.link || undefined,
          icon: CHANNEL_ICON[channel] || '🔔',
          tag: `notif-${n.id}`,
        });
      }
    }
  }

  // Handle new system alerts.
  function handleAlerts(data: any[] | undefined) {
    if (!data) return;
    const top = maxId(data);
    const prev = baseline.current.alerts;
    if (prev === null) {
      baseline.current.alerts = top;
      return;
    }
    if (top > prev) {
      baseline.current.alerts = top;
      const newest = data.find((x: any) => (x?.id || 0) === top);
      present({
        channel: 'alerts',
        title: i18n.t('sound.new.alerts'),
        message: (isAr && newest?.messageAr) ? newest.messageAr : (newest?.title || newest?.message || ''),
        link: '/alerts',
        icon: CHANNEL_ICON.alerts,
        tag: `alert-${top}`,
      });
    }
  }

  // Reset baselines when branch scope changes so we don't chime on a switch.
  useEffect(() => {
    baseline.current = { inbox: baseline.current.inbox, alerts: null };
  }, [branchId]);

  useEffect(() => {
    handleInbox(inboxQ.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inboxQ.data]);
  useEffect(() => {
    handleAlerts(alertsQ.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertsQ.data]);
}
