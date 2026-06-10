import React, { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, Info, X, ChevronDown, ExternalLink, Film, Users, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../utils/api';
import { getCurrentYear } from '../utils/helpers';
import { REGULAMIN_LAST_MODIFIED, RegulaminContent } from '../data/regulamin';

function parseTsError(msg, version) {
  if (!msg) return `Logowanie przez ${version} nie powiodło się.`;
  const m = msg.toLowerCase();
  if (m.includes('timeout') || m.includes('econnrefused') || m.includes('enotfound') || m.includes('connect')) {
    return `Nie można połączyć się z serwerem ${version}. Serwer jest niedostępny lub adres jest błędny.`;
  }
  if (m.includes('ip') || m.includes('nie znaleziono klienta') || m.includes('znaleziono')) {
    return `Nie znaleziono Twojego IP na serwerze ${version}. Upewnij się, że jesteś aktywnie połączony.`;
  }
  if (m.includes('grupy') || m.includes('group') || m.includes('wymaganej')) {
    return `Nie posiadasz wymaganej grupy serwerowej na ${version}.`;
  }
  if (m.includes('invalid_password') || m.includes('520') || m.includes('konfiguracji serwera')) {
    return `Błąd konfiguracji — nieprawidłowe dane administracyjne ${version}. Skontaktuj się z administratorem.`;
  }
  if (m.includes('closed unexpectedly') || m.includes('socket')) {
    return `Połączenie z serwerem ${version} zostało przerwane. Spróbuj ponownie.`;
  }
  return msg;
}

const MARQUEE_ITEMS = [
  'Biblioteka filmów i nagrań',
  'Watch Party ze znajomymi',
  'Tylko dla społeczności Alleria',
  'Bezpieczne logowanie',
  'Kontynuuj oglądanie na każdym urządzeniu',
  'Archiwum wspomnień',
];

export default function LoginPage() {
  const [tsLoading, setTsLoading]   = useState(false);
  const [ts3Loading, setTs3Loading] = useState(false);
  const [configOk, setConfigOk]     = useState(true);
  const [regulaminOpen, setRegulaminOpen] = useState(false);
  const [tsInfoOpen, setTsInfoOpen] = useState(false);
  const [discordError, setDiscordError] = useState(null);
  const [ts3Error, setTs3Error] = useState(null);
  const [ts6Error, setTs6Error] = useState(null);

  // TS login challenge (code sent to the user on TeamSpeak)
  const [challenge, setChallenge] = useState(null); // { challengeId, method, nickname, version }
  const [challengeCode, setChallengeCode] = useState('');
  const [challengeError, setChallengeError] = useState(null);
  const [challengeLoading, setChallengeLoading] = useState(false);

  const returnTo = (() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get('returnTo');
    if (r && r.startsWith('/') && !r.startsWith('//') && r !== '/login') return r;
    return '';
  })();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (!err) return;
    const map = {
      not_member:     'Nie jesteś członkiem serwera Discord.',
      no_role:        'Nie posiadasz wymaganej roli na serwerze Discord.',
      auth_failed:    'Logowanie nie powiodło się. Spróbuj ponownie.',
      no_code:        'Discord nie zwrócił kodu autoryzacji. Spróbuj ponownie.',
      config_missing: 'Serwer nie jest poprawnie skonfigurowany.',
    };
    setDiscordError(map[err] ?? 'Logowanie przez Discord nie powiodło się.');
  }, []);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(data => { if (!data.discord_configured) setConfigOk(false); })
      .catch(() => setConfigOk(false));
  }, []);

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'discord_auth_success') {
        const dest = (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) ? returnTo : '/';
        window.location.href = dest;
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [returnTo]);

  const handleDiscordLogin = (e) => {
    const inIframe = window.self !== window.top;
    if (inIframe) {
      e.preventDefault();
      const authUrl = '/auth/discord?popup=true';
      const w = 600, h = 800;
      const l = Math.round(window.screen.width / 2 - w / 2);
      const t = Math.round(window.screen.height / 2 - h / 2);
      const popup = window.open(authUrl, 'discord_oauth',
        `width=${w},height=${h},left=${l},top=${t},toolbar=no,menubar=no,scrollbars=yes,status=no`);
      if (!popup) window.top.location.href = authUrl;
    }
  };

  const startChallenge = (res, method, version) => {
    setChallenge({ challengeId: res.challengeId, method, nickname: res.nickname, version });
    setChallengeCode('');
    setChallengeError(null);
  };

  const handleTeamspeakLogin = async () => {
    setTsLoading(true); setTs6Error(null);
    try {
      const res = await api.loginTeamspeak();
      if (res?.challenge) startChallenge(res, 'teamspeak', 'TeamSpeak 6');
      else window.location.href = '/';
    }
    catch (err) { setTs6Error(parseTsError(err.message, 'TeamSpeak 6')); }
    finally { setTsLoading(false); }
  };

  const handleTeamspeak3Login = async () => {
    setTs3Loading(true); setTs3Error(null);
    try {
      const res = await api.loginTeamspeak3();
      if (res?.challenge) startChallenge(res, 'teamspeak3', 'TeamSpeak 3');
      else window.location.href = '/';
    }
    catch (err) { setTs3Error(parseTsError(err.message, 'TeamSpeak 3')); }
    finally { setTs3Loading(false); }
  };

  const handleChallengeSubmit = async () => {
    if (!challenge || challengeCode.trim().length < 6 || challengeLoading) return;
    setChallengeLoading(true); setChallengeError(null);
    try {
      const verifyFn = challenge.method === 'teamspeak3' ? api.verifyTeamspeak3 : api.verifyTeamspeak;
      await verifyFn(challenge.challengeId, challengeCode.trim());
      const dest = (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) ? returnTo : '/';
      window.location.href = dest;
    } catch (err) {
      setChallengeError(err.message || 'Nieprawidłowy kod.');
      setChallengeLoading(false);
    }
  };

  const cancelChallenge = () => {
    setChallenge(null);
    setChallengeCode('');
    setChallengeError(null);
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-zinc-950 flex flex-col">

      {/* ════ Cinematic backdrop ════ */}
      <div className="absolute inset-0 bg-gradient-to-br from-ember-950 via-zinc-950 to-zinc-950" />
      <div className="aurora-blob aurora-1 -top-48 -left-48 w-[640px] h-[640px] bg-ember-600/20 blur-[150px]" />
      <div className="aurora-blob aurora-2 bottom-0 right-0 w-[480px] h-[480px] bg-curtain-700/20 blur-[130px]" />
      <div className="aurora-blob aurora-3 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[560px] bg-amber-500/[0.06] blur-[100px]" />
      <div className="noise-overlay" />
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '32px 32px' }}
      />
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.012) 3px, rgba(255,255,255,0.012) 4px)',
      }} />

      {/* ════ Centered glass card ════ */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-10">

        <div className="w-full max-w-[420px] bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-[32px] shadow-2xl shadow-black/50 p-8 sm:p-10 animate-spring-in relative overflow-hidden">
          {/* top glow line */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-px bg-gradient-to-r from-transparent via-ember-500/70 to-transparent" />

          {/* Logo */}
          <div className="text-center mb-8">
            <div className="border-beam logo-glow w-16 h-16 rounded-[22px] bg-gradient-to-br from-ember-500/15 to-curtain-500/15 border border-white/10 flex items-center justify-center mx-auto mb-4 overflow-hidden">
              <img src="https://alleria.pl/image/logo-clr.png" alt="Alleria" className="w-11 h-11 object-contain animate-float" />
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight font-display">ALLERIA</h1>
            <p className="text-gradient text-[10px] font-bold tracking-[0.4em] mt-0.5 font-display">FILMY</p>
          </div>

          <div className="mb-7 text-center anim-stagger-1">
            <h2 className="text-lg font-bold text-white mb-1 font-display">Zaloguj się</h2>
            <p className="text-zinc-400 text-[13px]">Dostęp mają wyłącznie członkowie społeczności Alleria.</p>
          </div>

          {/* ── Config warning ── */}
          {!configOk && (
            <div className="mb-5 p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3 text-amber-300 text-xs animate-shake">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-0.5">Serwer nie skonfigurowany</p>
                <p className="opacity-75">Brak danych Discord w pliku .env. Sprawdź konfigurację i zrestartuj serwer.</p>
              </div>
            </div>
          )}

          {/* ── Discord error ── */}
          {discordError && (
            <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 text-red-300 text-xs animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{discordError}</span>
            </div>
          )}

          {/* ── Discord button ── */}
          <a
            href={`/auth/discord${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
            onClick={handleDiscordLogin}
            className="anim-stagger-2 group w-full flex items-center justify-center gap-3 py-3.5 px-5 bg-[#5865F2] hover:bg-[#4752C4] hover:-translate-y-0.5 active:scale-[0.96] text-white font-bold rounded-full transition-all shadow-lg shadow-[#5865F2]/30 hover:shadow-xl hover:shadow-[#5865F2]/40 text-sm no-underline relative overflow-hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 group-hover:rotate-[8deg] group-hover:scale-110 transition-transform duration-300">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z"/>
            </svg>
            Zaloguj przez Discord
          </a>

          {/* ── Separator ── */}
          <div className="relative my-5 anim-stagger-3">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 bg-[#131110] rounded-full text-zinc-500 text-xs font-medium">
                lub przez TeamSpeak
              </span>
            </div>
          </div>

          {/* ── TeamSpeak section ── */}
          <div className="space-y-2 anim-stagger-4">
            <div className="grid grid-cols-2 gap-2.5">
              {/* TS3 */}
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={handleTeamspeak3Login}
                  disabled={ts3Loading || tsLoading}
                  className="w-full py-3 px-3 bg-white/[0.06] hover:bg-white/10 hover:-translate-y-0.5 active:scale-[0.96] text-white rounded-2xl font-bold text-xs transition-all flex flex-col items-center gap-1.5 disabled:opacity-50 border border-white/10 hover:border-ember-500/40"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-zinc-400">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                  <span className="tracking-wider">{ts3Loading ? 'Łączenie…' : 'TEAMSPEAK 3'}</span>
                </button>
                <a
                  href="ts3server://alleria.pl"
                  title="alleria.pl"
                  className="flex items-center justify-center gap-1.5 py-2 rounded-full bg-white/[0.03] hover:bg-ember-500/10 border border-white/[0.07] hover:border-ember-500/30 text-zinc-500 hover:text-ember-400 text-[10px] font-semibold transition-all no-underline group"
                >
                  <ExternalLink className="w-2.5 h-2.5 shrink-0 group-hover:scale-110 group-hover:rotate-6 transition-transform" />
                  <span>Połącz z TS3</span>
                </a>
              </div>

              {/* TS6 */}
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={handleTeamspeakLogin}
                  disabled={ts3Loading || tsLoading}
                  className="w-full py-3 px-3 bg-white/[0.06] hover:bg-white/10 hover:-translate-y-0.5 active:scale-[0.96] text-white rounded-2xl font-bold text-xs transition-all flex flex-col items-center gap-1.5 disabled:opacity-50 border border-white/10 hover:border-ember-500/40"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-zinc-400">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                  <span className="tracking-wider">{tsLoading ? 'Łączenie…' : 'TEAMSPEAK 6'}</span>
                </button>
                <a
                  href="teamspeak://ts6.alleria.pl"
                  title="ts6.alleria.pl"
                  className="flex items-center justify-center gap-1.5 py-2 rounded-full bg-white/[0.03] hover:bg-ember-500/10 border border-white/[0.07] hover:border-ember-500/30 text-zinc-500 hover:text-ember-400 text-[10px] font-semibold transition-all no-underline group"
                >
                  <ExternalLink className="w-2.5 h-2.5 shrink-0 group-hover:scale-110 group-hover:rotate-6 transition-transform" />
                  <span>Połącz z TS6</span>
                </a>
              </div>
            </div>

            {/* TS error messages — aligned under each column */}
            {(ts3Error || ts6Error) && (
              <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                <div>
                  {ts3Error && (
                    <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-[10px] leading-snug flex items-start gap-1.5 animate-shake">
                      <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>{ts3Error}</span>
                    </div>
                  )}
                </div>
                <div>
                  {ts6Error && (
                    <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-[10px] leading-snug flex items-start gap-1.5 animate-shake">
                      <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>{ts6Error}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TS requirements — collapsible */}
            <button
              onClick={() => setTsInfoOpen(v => !v)}
              className="w-full flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors pt-1"
            >
              <Info className="w-3 h-3 shrink-0" />
              <span>Jak działa logowanie przez TeamSpeak?</span>
              <ChevronDown className={`w-3 h-3 ml-auto shrink-0 transition-transform duration-300 ${tsInfoOpen ? 'rotate-180' : ''}`} />
            </button>

            <div className={`reveal-y ${tsInfoOpen ? 'open' : ''}`}>
              <div className="text-[11px] text-zinc-400 space-y-1.5 pl-3 border-l-2 border-ember-500/30 pb-1">
                <p>• Musisz być <span className="font-semibold text-zinc-200">aktywnie połączony</span> z serwerem TS w momencie logowania.</p>
                <p>• Weryfikacja działa przez <span className="font-semibold text-zinc-200">dopasowanie IP</span> — nie używaj VPN, który zmienia Twój adres.</p>
                <p>• Wymagana jest <span className="font-semibold text-zinc-200">odpowiednia grupa serwerowa</span> na TS.</p>
                <p>• Po dopasowaniu bot wyśle Ci na TS <span className="font-semibold text-zinc-200">6-znakowy kod</span> — wpisz go, aby potwierdzić logowanie.</p>
              </div>
            </div>
          </div>

          {/* ── Regulamin ── */}
          <p className="text-center text-[11px] text-zinc-500 mt-7 anim-stagger-5">
            Logując się akceptujesz{' '}
            <button
              onClick={() => setRegulaminOpen(true)}
              className="link-underline text-ember-400 hover:text-ember-300 transition-colors font-medium"
            >
              Regulamin
            </button>
            {' '}platformy Alleria Filmy.
          </p>
        </div>

        {/* Feature chips under card */}
        <div className="flex flex-wrap justify-center gap-2 mt-7 max-w-md stagger-children">
          {[
            { icon: Film, label: 'Biblioteka nagrań' },
            { icon: Users, label: 'Tylko dla społeczności' },
            { icon: ShieldCheck, label: 'Bezpieczne logowanie' },
          ].map(({ icon: Icon, label }) => (
            <span key={label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-zinc-400 text-[11px] font-semibold hover:border-ember-500/40 hover:text-zinc-200 hover:-translate-y-0.5 transition-all">
              <Icon className="w-3.5 h-3.5 text-ember-400" /> {label}
            </span>
          ))}
        </div>
      </div>

      {/* ════ Marquee strip ════ */}
      <div className="relative z-10 overflow-hidden py-4 border-t border-white/[0.05]" aria-hidden="true">
        <div className="marquee gap-10 text-zinc-700 text-xs font-bold uppercase tracking-[0.3em] font-display whitespace-nowrap">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((t, i) => (
            <span key={i} className="flex items-center gap-10">
              {t} <Sparkles className="w-3.5 h-3.5 text-ember-700" />
            </span>
          ))}
        </div>
      </div>

      <p className="relative z-10 text-center text-xs text-zinc-700 pb-5">
        © 2025–{getCurrentYear()} Alleria.pl · built by{' '}
        <a href="https://github.com/mrfroncu" target="_blank" rel="noopener noreferrer"
           className="text-zinc-600 hover:text-zinc-400 transition-colors">Matthew</a>
      </p>

      {/* ════ REGULAMIN MODAL ════ */}
      {regulaminOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setRegulaminOpen(false); }}
        >
          <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-[28px] shadow-2xl border border-zinc-200 dark:border-white/10 max-h-[90vh] flex flex-col animate-spring-in">
            <div className="flex items-start justify-between px-7 py-6 border-b border-zinc-100 dark:border-white/10 shrink-0">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-display">Regulamin platformy Alleria Filmy</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Ostatnia aktualizacja: {REGULAMIN_LAST_MODIFIED}</p>
              </div>
              <button
                onClick={() => setRegulaminOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-100 dark:bg-white/10 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-white/20 hover:rotate-90 transition-all duration-300 shrink-0 ml-4 mt-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-7 py-6 space-y-6 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <RegulaminContent />
            </div>
          </div>
        </div>
      )}

      {/* ════ TS LOGIN CHALLENGE MODAL ════ */}
      {challenge && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget && !challengeLoading) cancelChallenge(); }}
        >
          <div className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[28px] shadow-2xl border border-zinc-200 dark:border-white/10 p-7 animate-spring-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-ember-50 dark:bg-ember-500/10 flex items-center justify-center shrink-0 animate-float">
                <ShieldCheck className="w-6 h-6 text-ember-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display">Potwierdź logowanie</h2>
                <p className="text-xs text-zinc-500">{challenge.version}{challenge.nickname ? ` · ${challenge.nickname}` : ''}</p>
              </div>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
              Wysłaliśmy 6-znakowy kod na Twojego klienta {challenge.version} (prywatna wiadomość od bota). Wpisz go poniżej, aby dokończyć logowanie.
            </p>
            <input
              type="text"
              value={challengeCode}
              onChange={(e) => setChallengeCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleChallengeSubmit(); }}
              placeholder="K7P2QX"
              maxLength={6}
              autoFocus
              className="w-full text-center text-2xl font-mono font-bold tracking-[0.4em] py-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border-2 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-ember-400 dark:focus:border-ember-500 mb-3"
            />
            {challengeError && (
              <div className="mb-3 p-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-start gap-1.5 animate-shake">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{challengeError}</span>
              </div>
            )}
            <div className="flex gap-2.5">
              <button
                onClick={cancelChallenge}
                disabled={challengeLoading}
                className="flex-1 py-3 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold text-sm transition-all active:scale-[0.96] disabled:opacity-50"
              >
                Anuluj
              </button>
              <button
                onClick={handleChallengeSubmit}
                disabled={challengeLoading || challengeCode.length < 6}
                className="flex-1 btn-primary !py-3 text-sm"
              >
                {challengeLoading ? 'Sprawdzanie…' : 'Zaloguj'}
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 text-center mt-3">Kod ważny 5 minut. Nie udostępniaj go nikomu.</p>
          </div>
        </div>
      )}
    </div>
  );
}
