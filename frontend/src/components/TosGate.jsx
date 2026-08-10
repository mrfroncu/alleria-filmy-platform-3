import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';
import { renderMarkdown } from '../utils/markdown';

// Mounted once at the app root. Every login method (Discord/TS3/TS6) ends in a hard page
// reload, which remounts AuthProvider — so gating on `user.tosAccepted` here covers all three
// uniformly without needing per-method hooks. Non-dismissable by design: no backdrop click,
// no Escape handler — only "Zaakceptuj" or "Wyloguj" get you past it.
export default function TosGate() {
  const { user, logout } = useAuth();
  const [tos, setTos] = useState(null);
  const [busy, setBusy] = useState(false);
  const needsAcceptance = !!user && !user.tosAccepted;

  useEffect(() => {
    if (needsAcceptance && !tos) {
      api.getTos().then(setTos).catch(() => {});
    }
  }, [needsAcceptance, tos]);

  if (!needsAcceptance || !tos) return null;

  const handleAccept = async () => {
    setBusy(true);
    try {
      await api.acceptTos();
      window.location.reload();
    } catch (e) {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-white/10 flex flex-col max-h-[85vh]"
        style={{ animation: 'slideUp 0.3s ease-out' }}
      >
        <div className="p-7 pb-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white font-display">
            {user.tosPreviouslyAccepted ? 'Aktualizacja regulaminu' : 'Regulamin platformy'}
          </h2>
          <p className="text-xs text-zinc-400 mt-1">Ostatnia aktualizacja: {new Date(tos.updatedAt).toLocaleDateString('pl-PL')}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-7 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          {renderMarkdown(tos.content)}
        </div>
        <div className="p-7 pt-4 border-t border-zinc-100 dark:border-zinc-800 shrink-0">
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-4">
            {user.tosPreviouslyAccepted
              ? 'Regulamin został zaktualizowany — musisz zaakceptować go ponownie, aby korzystać z platformy.'
              : 'Musisz zaakceptować regulamin, aby korzystać z platformy.'}
          </p>
          <div className="flex gap-3">
            <button onClick={logout} disabled={busy} className="flex-1 btn-secondary disabled:opacity-50">Wyloguj</button>
            <button onClick={handleAccept} disabled={busy} className="flex-1 btn-primary disabled:opacity-50">
              {busy ? 'Zapisywanie…' : 'Zaakceptuj'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
