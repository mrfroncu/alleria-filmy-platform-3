import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { api } from '../utils/api';
import { useAuth } from './AuthContext';

const NotificationsContext = createContext(null);

export function useNotifications() {
  return useContext(NotificationsContext);
}

const PAGE_SIZE = 30;

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  // Read live inside async callbacks (onclose fires after this render's closures are stale) —
  // a plain variable captured by `connect` would still say "true" after logout scheduled the close.
  const shouldReconnectRef = useRef(false);

  const loadInitial = useCallback(() => {
    setLoading(true);
    api.getNotifications({ limit: PAGE_SIZE }).then(r => {
      setNotifications(r.notifications || []);
      setUnreadCount(r.unreadCount || 0);
      setHasMore((r.notifications || []).length >= PAGE_SIZE);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const loadMore = useCallback(() => {
    if (notifications.length === 0) return;
    const before = notifications[notifications.length - 1].id;
    setLoading(true);
    api.getNotifications({ limit: PAGE_SIZE, before }).then(r => {
      setNotifications(p => [...p, ...(r.notifications || [])]);
      setHasMore((r.notifications || []).length >= PAGE_SIZE);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [notifications]);

  const markRead = useCallback((id) => {
    setNotifications(prev => prev.map(n => (n.id === id && !n.read) ? { ...n, read: 1 } : n));
    setUnreadCount(c => Math.max(0, c - 1));
    api.markNotificationRead(id).catch(() => {});
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: 1 })));
    setUnreadCount(0);
    api.markAllNotificationsRead().catch(() => {});
  }, []);

  const connect = useCallback(async () => {
    try {
      const { token } = await api.getNotificationsToken();
      if (!shouldReconnectRef.current) return; // logged out while the token request was in flight
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/notifications`);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        ws.send(JSON.stringify({ type: 'auth', token }));
        loadInitial(); // resync — catches anything created while we were disconnected
      };
      ws.onmessage = (e) => {
        let msg; try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.type === 'notification') {
          setNotifications(prev => [msg.notification, ...prev]);
          setUnreadCount(c => c + 1);
        }
      };
      ws.onclose = () => {
        wsRef.current = null;
        if (!shouldReconnectRef.current) return;
        const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 30000);
        reconnectAttemptRef.current++;
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
      ws.onerror = () => { try { ws.close(); } catch (_) {} };
    } catch (_) {
      if (!shouldReconnectRef.current) return;
      const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 30000);
      reconnectAttemptRef.current++;
      reconnectTimerRef.current = setTimeout(connect, delay);
    }
  }, [loadInitial]);

  useEffect(() => {
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (wsRef.current) { try { wsRef.current.close(); } catch (_) {} wsRef.current = null; }

    if (!user) {
      shouldReconnectRef.current = false;
      setNotifications([]); setUnreadCount(0);
      return;
    }

    shouldReconnectRef.current = true;
    reconnectAttemptRef.current = 0;
    loadInitial();
    connect();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      if (wsRef.current) { try { wsRef.current.close(); } catch (_) {} wsRef.current = null; }
    };
  }, [user, connect, loadInitial]);

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, loading, hasMore, loadMore, markRead, markAllRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}
