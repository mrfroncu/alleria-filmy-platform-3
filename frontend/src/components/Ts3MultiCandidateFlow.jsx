import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ShieldAlert, Loader2 } from 'lucide-react';
import { api } from '../utils/api';

const POLL_INTERVAL_MS = 2000;

// TS3 multi-candidate login/link flow. Several TS3 identities share the requester's IP,
// so instead of guessing who's really logging in (the old bug), the bot messages everyone
// the SAME code over TS3 chat and whichever one replies identifies themselves — TS3's
// persistent ServerQuery connection can receive that reply; TS6 can't (see TsChallengeModal
// for that flow, which sends a distinct code per candidate instead).
//
// Three phases: consent → waiting (polls the backend every 2s) → error. On success the
// backend completes the login/link itself; the raw terminal response is handed to
// `onResolved` so the caller (LoginPage / ProfilePage) decides what happens next — a
// redirect, or opening the merge-confirmation modal — exactly like it already does for
// TsChallengeModal's single-candidate flow.
export default function Ts3MultiCandidateFlow({ consentToken, count, onCancel, onResolved }) {
  const [phase, setPhase] = useState('consent'); // 'consent' | 'waiting' | 'error'
  const [code, setCode] = useState(null);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const pollTimer = useRef(null);

  useEffect(() => {
    setPhase('consent');
    setCode(null);
    setError(null);
    clearTimeout(pollTimer.current);
    return () => clearTimeout(pollTimer.current);
  }, [consentToken]);

  if (!consentToken) return null;

  const schedulePoll = (id) => {
    pollTimer.current = setTimeout(() => doPoll(id), POLL_INTERVAL_MS);
  };

  const doPoll = async (id) => {
    try {
      const res = await api.pollTeamspeak3Multi(id);
      if (res?.resolved === false) {
        schedulePoll(id);
        return;
      }
      onResolved(res);
    } catch (err) {
      setError(err.message || 'Wygasło oczekiwanie na odpowiedź.');
      setPhase('error');
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    setError(null);
    try {
      const res = await api.confirmTeamspeak3Multi(consentToken);
      setCode(res.code);
      setPhase('waiting');
      schedulePoll(res.challengeId);
    } catch (err) {
      setError(err.message || 'Nie udało się wysłać kodu.');
      setPhase('error');
    }
    setConfirming(false);
  };

  if (phase === 'consent') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <div className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-white/10 p-7 animate-slide-up">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Kilku użytkowników na tym IP</h2>
              <p className="text-xs text-zinc-500">TeamSpeak 3</p>
            </div>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
            Na Twoim adresie IP wykryliśmy {count} {count === 1 ? 'użytkownika' : 'użytkowników'} TeamSpeak 3.
            Jeśli chcesz spróbować się zalogować, wyślemy wiadomość z kodem do WSZYSTKICH — upewnij się, że to rzeczywiście Ty.
          </p>
          {error && (
            <div className="mb-3 p-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex gap-2.5">
            <button onClick={onCancel} disabled={confirming} className="btn-sm-secondary flex-1">
              Anuluj
            </button>
            <button onClick={handleConfirm} disabled={confirming} className="btn-sm-primary flex-1">
              {confirming ? 'Wysyłanie…' : 'Wyślij kod'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'waiting') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <div className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-white/10 p-7 animate-slide-up text-center">
          <div className="w-11 h-11 rounded-2xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
          </div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Czekamy na odpowiedź</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
            Odpisz na wiadomość od bota na TeamSpeaku 3, wpisując dokładnie ten kod:
          </p>
          <div className="text-2xl font-mono font-bold tracking-[0.4em] py-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white mb-4">
            {code}
          </div>
          <button onClick={onCancel} className="btn-sm-secondary w-full">Anuluj</button>
          <p className="text-[11px] text-zinc-400 mt-3">Kod ważny 5 minut. Nie udostępniaj go nikomu.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-white/10 p-7 animate-slide-up">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center shrink-0">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Nie udało się</h2>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">{error}</p>
        <button onClick={onCancel} className="btn-sm-primary w-full">Zamknij</button>
      </div>
    </div>
  );
}
