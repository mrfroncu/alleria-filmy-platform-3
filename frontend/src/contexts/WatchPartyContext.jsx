import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { api } from '../utils/apiClient';

const WatchPartyContext = createContext(null);
const STORAGE_KEY = 'alleria-watch-party-code';

function wsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/watch-party`;
}

export function WatchPartyProvider({ children }) {
  const [party, setParty] = useState(null);
  const [sourceKey, setSourceKey] = useState('main');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnectReason, setDisconnectReason] = useState(null);

  const wsRef = useRef(null);
  const syncCallbackRef = useRef(null);
  const codeRef = useRef(null);

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    setConnecting(false);
  }, []);

  const connect = useCallback((code) => {
    setConnecting(true);
    setDisconnectReason(null);
    codeRef.current = code;

    api.getWatchPartyToken().then(({ token }) => {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token, code }));

      ws.onmessage = (evt) => {
        let data;
        try { data = JSON.parse(evt.data); } catch (_) { return; }

        switch (data.type) {
          case 'state':
            setParty(data.party);
            setSourceKey('main');
            setConnected(true);
            setConnecting(false);
            sessionStorage.setItem(STORAGE_KEY, code);
            break;
          case 'error':
            setConnecting(false);
            break;
          case 'member_joined':
            setParty((p) => p && { ...p, members: [...p.members.filter((m) => m.id !== data.member.id), data.member] });
            break;
          case 'member_left':
            setParty((p) => p && { ...p, members: p.members.filter((m) => m.id !== data.userId) });
            break;
          case 'play':
            setParty((p) => p && { ...p, playing: true, position: data.position ?? p.position });
            syncCallbackRef.current?.(data);
            break;
          case 'pause':
            setParty((p) => p && { ...p, playing: false, position: data.position ?? p.position });
            syncCallbackRef.current?.(data);
            break;
          case 'seek':
            setParty((p) => p && { ...p, position: data.position, playing: data.playing });
            syncCallbackRef.current?.(data);
            break;
          case 'source_change':
            setSourceKey(data.sourceKey);
            setParty((p) => p && { ...p, position: data.position ?? p.position });
            syncCallbackRef.current?.(data);
            break;
          case 'queue_update':
            setParty((p) => p && { ...p, queue: data.queue, currentIndex: data.currentIndex });
            setSourceKey('main');
            break;
          case 'control_changed':
            setParty((p) => p && { ...p, members: p.members.map((m) => (m.id === data.userId ? { ...m, canControl: data.canControl } : m)) });
            break;
          case 'host_changed':
            setParty((p) => p && { ...p, hostId: data.hostId });
            break;
          case 'sync':
            setParty((p) => p && { ...p, position: data.position, playing: data.playing, currentIndex: data.currentIndex ?? p.currentIndex });
            syncCallbackRef.current?.(data);
            break;
          case 'kicked':
            setDisconnectReason('kicked');
            cleanup();
            setParty(null);
            sessionStorage.removeItem(STORAGE_KEY);
            break;
          case 'party_deleted':
            setDisconnectReason('party_deleted');
            cleanup();
            setParty(null);
            sessionStorage.removeItem(STORAGE_KEY);
            break;
          default:
            break;
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setConnecting(false);
      };
      ws.onerror = () => setConnecting(false);
    }).catch(() => setConnecting(false));
  }, [cleanup]);

  const createParty = useCallback(async () => {
    const { code } = await api.createWatchParty();
    connect(code);
    return code;
  }, [connect]);

  const joinParty = useCallback((code) => connect(code), [connect]);

  const leaveParty = useCallback(() => {
    cleanup();
    setParty(null);
    setDisconnectReason(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }, [cleanup]);

  const endParty = useCallback(async () => {
    if (!codeRef.current) return;
    try { await api.endWatchParty(codeRef.current); } catch (_) {}
    leaveParty();
  }, [leaveParty]);

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  }, []);

  const registerSyncCallback = useCallback((cb) => { syncCallbackRef.current = cb; }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) connect(stored);
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = {
    party, sourceKey, connected, connecting, inParty: !!party, disconnectReason,
    clearDisconnectReason: () => setDisconnectReason(null),
    send, createParty, joinParty, leaveParty, endParty, registerSyncCallback,
  };

  return <WatchPartyContext.Provider value={value}>{children}</WatchPartyContext.Provider>;
}

export function useWatchParty() {
  const ctx = useContext(WatchPartyContext);
  if (!ctx) throw new Error('useWatchParty must be used within WatchPartyProvider');
  return ctx;
}
