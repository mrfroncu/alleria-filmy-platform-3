import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { api } from '../utils/api';

const WatchPartyContext = createContext(null);

export function useWatchParty() {
  return useContext(WatchPartyContext);
}

export function WatchPartyProvider({ children }) {
  const [party, setParty] = useState(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnectReason, setDisconnectReason] = useState(null); // 'kicked' | 'party_deleted' | null
  const wsRef = useRef(null);
  // Direct callback for immediate player control (bypasses React render cycle)
  const syncCallbackRef = useRef(null);

  const registerSyncCallback = useCallback((cb) => {
    syncCallbackRef.current = cb;
  }, []);

  const disconnect = useCallback((reason = null) => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (_) {}
      wsRef.current = null;
    }
    syncCallbackRef.current = null;
    setParty(null);
    setConnected(false);
    setConnecting(false);
    if (reason) setDisconnectReason(reason);
  }, []);

  const handleMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'state':
        setParty(msg.party);
        setConnected(true);
        break;

      case 'member_joined':
        setParty(p => p ? { ...p, members: [...p.members.filter(m => m.id !== msg.member.id), msg.member] } : p);
        break;

      case 'member_left':
        setParty(p => p ? { ...p, members: p.members.filter(m => m.id !== msg.userId) } : p);
        break;

      case 'host_changed':
        setParty(p => p ? { ...p, hostId: msg.hostId, members: p.members.map(m => m.id === msg.hostId ? { ...m, canControl: true } : m) } : p);
        break;

      case 'control_changed':
        setParty(p => p ? { ...p, members: p.members.map(m => m.id === msg.userId ? { ...m, canControl: msg.canControl } : m) } : p);
        break;

      case 'play':
        setParty(p => p ? { ...p, playing: true, position: msg.position } : p);
        // Directly control video without waiting for React re-render
        syncCallbackRef.current?.({ type: 'play', position: msg.position });
        break;

      case 'pause':
        setParty(p => p ? { ...p, playing: false, position: msg.position } : p);
        syncCallbackRef.current?.({ type: 'pause', position: msg.position });
        break;

      case 'seek':
        setParty(p => p ? { ...p, position: msg.position, playing: msg.playing } : p);
        syncCallbackRef.current?.({ type: 'seek', position: msg.position, playing: msg.playing });
        break;

      case 'source_change':
        setParty(p => {
          if (!p) return p;
          const queue = [...p.queue];
          if (queue[p.currentIndex]) queue[p.currentIndex] = { ...queue[p.currentIndex], sourceKey: msg.sourceKey };
          return { ...p, queue, position: 0 };
        });
        // No direct callback — source change causes player remount via key change
        break;

      case 'queue_update':
        setParty(p => p ? { ...p, queue: msg.queue, currentIndex: msg.currentIndex ?? p.currentIndex } : p);
        break;

      case 'sync':
        setParty(p => p ? { ...p, position: msg.position, playing: msg.playing, currentIndex: msg.currentIndex ?? p.currentIndex } : p);
        syncCallbackRef.current?.({ type: msg.playing ? 'play' : 'pause', position: msg.position });
        break;

      case 'kicked':
        disconnect('kicked');
        break;

      case 'party_deleted':
        disconnect('party_deleted');
        break;

      case 'error':
        console.error('[WatchParty]', msg.message);
        break;
    }
  }, [disconnect]);

  const connect = useCallback(async (code) => {
    setDisconnectReason(null);
    setConnecting(true);
    if (wsRef.current) { try { wsRef.current.close(); } catch (_) {} }

    const { token } = await api.getWatchPartyToken();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/watch-party`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', token, code: code.toUpperCase() }));
    };
    ws.onmessage = (e) => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === 'state') setConnecting(false);
      handleMessage(msg);
    };
    ws.onclose = () => { setConnected(false); setConnecting(false); };
    ws.onerror = () => { setConnected(false); setConnecting(false); };
  }, [handleMessage]);

  const send = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const createParty = useCallback(async () => {
    const { code } = await api.createWatchParty();
    await connect(code);
    return code;
  }, [connect]);

  const joinParty = useCallback(async (code) => {
    await api.getWatchParty(code);
    await connect(code);
  }, [connect]);

  const leaveParty = useCallback(() => disconnect(), [disconnect]);

  const endParty = useCallback(async () => {
    if (!party) return;
    try { await api.deleteWatchParty(party.code); } catch (_) {}
    disconnect();
  }, [party, disconnect]);

  useEffect(() => () => disconnect(), [disconnect]);

  return (
    <WatchPartyContext.Provider value={{ party, connected, connecting, inParty: !!party, disconnectReason, clearDisconnectReason: () => setDisconnectReason(null), send, createParty, joinParty, leaveParty, endParty, registerSyncCallback }}>
      {children}
    </WatchPartyContext.Provider>
  );
}
