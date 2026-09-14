import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as notificationsApi from '../api/notifications';
import type { Notification } from '../api/notifications';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { BellIcon } from './icons';

/**
 * UOS HOSTEL BR.md §13/§14 — in-app notification tray. No live delivery
 * transport exists (flow.md §20's own note: SSE/WebSocket/polling is an
 * ADR-level decision, not made yet) — this polls the unread count on an
 * interval, the same "real but not real-time" tradeoff the no-show/overdue
 * background jobs already made on the backend side (5-minute sweeps, not
 * instant). Self-contained: drop it anywhere, it manages its own state.
 */
export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function refreshCount() {
      try {
        const count = await notificationsApi.getUnreadCount();
        if (!cancelled) setUnreadCount(count);
      } catch {
        // Non-critical — a failed poll just leaves the badge stale until
        // the next tick, not worth surfacing as an error to the user.
      }
    }
    void refreshCount();
    const timer = setInterval(() => void refreshCount(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    try {
      setNotifications(await notificationsApi.listNotifications());
    } finally {
      setLoading(false);
    }
  }

  async function handleClick(n: Notification) {
    if (!n.read) {
      await notificationsApi.markRead(n.id);
      setUnreadCount((c) => Math.max(0, c - 1));
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  async function handleMarkAllRead() {
    await notificationsApi.markAllRead();
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void handleOpen()}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <BellIcon size={19} />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Notifications"
        footer={
          unreadCount > 0 ? (
            <Button variant="secondary" fullWidth onClick={() => void handleMarkAllRead()}>
              Mark all as read
            </Button>
          ) : undefined
        }
      >
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : notifications.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => void handleClick(n)}
                  className={['flex w-full flex-col gap-0.5 rounded-lg px-2 py-3 text-left transition-colors hover:bg-muted', !n.read && 'bg-accent-subtle'].filter(Boolean).join(' ')}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                    {n.title}
                  </span>
                  {n.body && <span className="text-xs text-muted-foreground">{n.body}</span>}
                  <span className="text-[11px] text-slate-400">{new Date(n.createdAt).toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}
