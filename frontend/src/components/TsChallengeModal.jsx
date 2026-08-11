import React from 'react';
import { AlertCircle, ShieldCheck } from 'lucide-react';

// TS3/TS6 login-challenge modal — bot sends a 6-char code via TS private message, user
// types it back here. Shared between LoginPage (normal login) and ProfilePage (account
// linking), which is why it takes everything as props instead of owning its own state.
export default function TsChallengeModal({ challenge, code, onCodeChange, onSubmit, onCancel, loading, error, multipleCandidates, count }) {
  if (!challenge) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel(); }}
    >
      <div className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-white/10 p-7 animate-slide-up">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-violet-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Potwierdź logowanie</h2>
            <p className="text-xs text-zinc-500">{challenge.version}{challenge.nickname ? ` · ${challenge.nickname}` : ''}</p>
          </div>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          Wysłaliśmy 6-znakowy kod na Twojego klienta {challenge.version} (prywatna wiadomość od bota). Wpisz go poniżej, aby dokończyć logowanie.
        </p>
        {multipleCandidates && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-4 -mt-2">
            Wykryto kilku użytkowników na tym IP{count ? ` (${count})` : ''} - wysłaliśmy osobny kod do każdego. Wpisz TYLKO kod, który otrzymałeś Ty.
          </p>
        )}
        <input
          type="text"
          value={code}
          onChange={(e) => onCodeChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
          placeholder="K7P2QX"
          maxLength={6}
          autoFocus
          className="w-full text-center text-2xl font-mono font-bold tracking-[0.4em] py-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500 mb-3"
        />
        {error && (
          <div className="mb-3 p-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex gap-2.5">
          <button onClick={onCancel} disabled={loading} className="btn-sm-secondary flex-1">
            Anuluj
          </button>
          <button onClick={onSubmit} disabled={loading || code.length < 6} className="btn-sm-primary flex-1">
            {loading ? 'Sprawdzanie…' : 'Zaloguj'}
          </button>
        </div>
        <p className="text-[11px] text-zinc-400 text-center mt-3">Kod ważny 5 minut. Nie udostępniaj go nikomu.</p>
      </div>
    </div>
  );
}
