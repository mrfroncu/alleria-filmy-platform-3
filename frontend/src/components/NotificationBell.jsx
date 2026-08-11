import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Film, MessageCircle, Download, Flag, X, Loader2, CheckCheck } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationsContext';
import { formatDate } from '../utils/helpers';

const TYPE_ICON = {
  new_video: Film,
  comment_reply: MessageCircle,
  gdpr_export_ready: Download,
  report_resolved: Flag,
};

function NotificationRow({ n, onOpen }) {
  const Icon = TYPE_ICON[n.type] || Bell;
  return (
    <button
      onClick={() => onOpen(n)}
      className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${!n.read ? 'bg-violet-50/50 dark:bg-violet-500/[0.06]' : ''}`}
    >
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${!n.read ? 'bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-300' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${!n.read ? 'font-bold text-zinc-900 dark:text-white' : 'font-medium text-zinc-700 dark:text-zinc-300'}`}>{n.title}</p>
        {n.body && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 break-words">{n.body}</p>}
        <p className="text-[10px] text-zinc-400 font-mono mt-1">{formatDate(n.created_at)}</p>
      </div>
      {!n.read && <span className="w-2 h-2 rounded-full bg-violet-500 shrink-0 mt-1.5" />}
    </button>
  );
}

function NotificationPanel({ onClose }) {
  const { notifications, unreadCount, loading, hasMore, loadMore, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();

  const handleOpen = (n) => {
    if (!n.read) markRead(n.id);
    onClose();
    if (n.url) navigate(n.url);
  };

  return (
    <>
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
        <span className="font-bold text-zinc-900 dark:text-white text-sm">Powiadomienia</span>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button onClick={markAllRead} title="Oznacz wszystkie jako przeczytane" className="btn-icon-violet">
              <CheckCheck className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="btn-icon-zinc sm:hidden"><X className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60">
        {notifications.length === 0 && !loading ? (
          <div className="p-8 text-center text-zinc-400 text-sm">Brak powiadomień.</div>
        ) : (
          notifications.map(n => <NotificationRow key={n.id} n={n} onOpen={handleOpen} />)
        )}
        {loading && <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 text-violet-500 animate-spin" /></div>}
      </div>
      {hasMore && !loading && notifications.length > 0 && (
        <button onClick={loadMore} className="shrink-0 py-2.5 text-xs font-semibold text-violet-500 hover:text-violet-400 border-t border-zinc-100 dark:border-zinc-800 transition-colors">
          Załaduj więcej
        </button>
      )}
    </>
  );
}

// fullScreenOnly: the sidebar's fallback user card (shown when the top bar setting is off) is
// only ~272px wide — a right-anchored dropdown there would grow off the left edge of the
// viewport, so that call site forces the full-screen panel regardless of screen width.
export default function NotificationBell({ fullScreenOnly = false }) {
  const { unreadCount } = useNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onEscape = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="relative" ref={rootRef}>
      <button onClick={() => setOpen(v => !v)} className="btn-icon-zinc relative" title="Powiadomienia">
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white flex items-center justify-center text-[9px] font-bold leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        fullScreenOnly ? (
          <div className="fixed inset-0 z-[60] bg-white dark:bg-zinc-900 flex flex-col">
            <NotificationPanel onClose={close} />
          </div>
        ) : (
          <>
            {/* Mobile: full-screen panel */}
            <div className="fixed inset-0 z-[60] bg-white dark:bg-zinc-900 flex flex-col sm:hidden">
              <NotificationPanel onClose={close} />
            </div>
            {/* Desktop: anchored dropdown */}
            <div className="hidden sm:flex absolute right-0 top-full mt-2 w-96 max-h-[32rem] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-50 flex-col overflow-hidden animate-scale-in origin-top-right">
              <NotificationPanel onClose={close} />
            </div>
          </>
        )
      )}
    </div>
  );
}
