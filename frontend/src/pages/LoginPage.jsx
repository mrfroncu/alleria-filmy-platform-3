import React, { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, Info, X, ChevronDown, ExternalLink, Film, Users, ShieldCheck } from 'lucide-react';
import { api } from '../utils/api';
import { getCurrentYear, parseTsError } from '../utils/helpers';
import { REGULAMIN_LAST_MODIFIED, RegulaminContent } from '../data/regulamin';
import TsChallengeModal from '../components/TsChallengeModal';

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
    setChallenge({
      challengeId: res.challengeId, method, nickname: res.nickname, version,
      multipleCandidates: res.multipleCandidates, count: res.count,
    });
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
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* ══════════════════════════════════════
          LEFT PANEL — branding (desktop only)
          ══════════════════════════════════════ */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] relative overflow-hidden bg-zinc-950 flex-col">

        {/* Layered background */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-950 via-zinc-950 to-zinc-950" />
        <div className="absolute -top-48 -left-48 w-[600px] h-[600px] bg-violet-600/25 rounded-full blur-[130px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-fuchsia-700/20 rounded-full blur-[110px] pointer-events-none" />
        <div className="animate-float absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-violet-500/5 rounded-full blur-[80px] pointer-events-none" />

        {/* Subtle dot grid */}
        <div
          className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />

        {/* Horizontal scan lines — cinematic feel */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.012) 3px, rgba(255,255,255,0.012) 4px)',
        }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full p-12 xl:p-16">

          {/* Top: logo badge */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden backdrop-blur-sm">
              <img src="https://alleria.pl/image/favicon.png" alt="Alleria" className="w-6 h-6 object-contain" />
            </div>
            <span className="text-white/60 text-xs font-semibold tracking-[0.2em] uppercase">Alleria.pl</span>
          </div>

          {/* Middle: hero */}
          <div className="flex-1 flex flex-col justify-center py-12">
            <p className="text-violet-400 text-xs font-semibold tracking-[0.25em] uppercase mb-5">
              Prywatna platforma wideo
            </p>

            <h1 className="text-5xl xl:text-6xl 2xl:text-7xl font-black text-white leading-[1.05] tracking-tight mb-6">
              Filmy<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400">
                społeczności.
              </span>
            </h1>

            <p className="text-zinc-400 text-base xl:text-lg leading-relaxed max-w-xs xl:max-w-sm mb-12">
              Archiwum wspomnień, kompilacje z rozgrywek - wszystko w jednym miejscu, wyłącznie dla członków społecznościAlleria.
            </p>

            {/* Feature badges */}
            <div className="flex flex-col gap-3">
              {[
                { icon: Film,        label: 'Biblioteka filmów i nagrań' },
                { icon: Users,       label: 'Dostęp tylko dla społeczności' },
                { icon: ShieldCheck, label: 'Bezpieczne i wygodne logowanie przez Discord i TeamSpeak' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-violet-400" />
                  </div>
                  <span className="text-sm text-zinc-400">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom: copyright */}
          <p className="text-zinc-700 text-xs">
            © 2025–{getCurrentYear()} Alleria.pl · built by{' '}
            <a href="https://github.com/mrfroncu" target="_blank" rel="noopener noreferrer"
               className="text-zinc-600 hover:text-zinc-400 transition-colors">Matthew</a>
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════
          RIGHT PANEL — login form
          ══════════════════════════════════════ */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen lg:min-h-0 bg-white dark:bg-zinc-950 px-6 py-12 relative">

        {/* Mobile background blobs */}
        <div className="lg:hidden absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-32 -right-32 w-64 h-64 bg-violet-500/10 dark:bg-violet-500/20 rounded-full blur-[80px]" />
          <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-fuchsia-600/10 dark:bg-fuchsia-600/20 rounded-full blur-[80px]" />
        </div>

        <div className="w-full max-w-[360px] relative z-10">

          {/* Mobile header */}
          <div className="lg:hidden text-center mb-10">
            <div className="w-16 h-16 rounded-[22px] bg-gradient-to-br from-violet-500/15 to-fuchsia-500/15 border border-zinc-200 dark:border-white/10 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-violet-500/10 overflow-hidden">
              <img src="https://alleria.pl/image/logo-clr.png" alt="Alleria" className="w-11 h-11 object-contain" />
            </div>
            <h1 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">ALLERIA</h1>
            <p className="text-xs font-bold tracking-[0.35em] text-violet-500 mt-0.5">FILMY</p>
          </div>

          {/* Form heading */}
          <div className="mb-8 anim-stagger-1">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-1">Zaloguj się</h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">Dostęp mają wyłącznie członkowie społeczności Alleria.</p>
          </div>

          {/* ── Config warning ── */}
          {!configOk && (
            <div className="mb-5 p-3.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl flex items-start gap-3 text-amber-700 dark:text-amber-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-0.5">Serwer nie skonfigurowany</p>
                <p className="opacity-75">Brak danych Discord w pliku .env. Sprawdź konfigurację i zrestartuj serwer.</p>
              </div>
            </div>
          )}

          {/* ── Discord error ── */}
          {discordError && (
            <div className="mb-5 p-3.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl flex items-start gap-3 text-red-700 dark:text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{discordError}</span>
            </div>
          )}

          {/* ── Discord button ── */}
          <a
            href={`/auth/discord${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
            onClick={handleDiscordLogin}
            className="group w-full flex items-center justify-center gap-3 py-3.5 px-5 bg-[#5865F2] hover:bg-[#4752C4] active:scale-[0.98] text-white font-semibold rounded-2xl transition-all shadow-lg shadow-[#5865F2]/30 text-sm no-underline anim-stagger-2"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z"/>
            </svg>
            Zaloguj przez Discord
          </a>

          {/* ── Separator ── */}
          <div className="relative my-5 anim-stagger-3">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 bg-white dark:bg-zinc-950 text-zinc-400 dark:text-zinc-600 text-xs font-medium">
                lub przez TeamSpeak
              </span>
            </div>
          </div>

          {/* ── TeamSpeak section ── */}
          <div className="space-y-2 anim-stagger-4">

            {/* TS3 — left, TS6 — right */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* TS3 */}
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={handleTeamspeak3Login}
                  disabled={ts3Loading || tsLoading}
                  className="w-full py-3 px-3 bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 active:scale-[0.98] text-white rounded-xl font-bold text-xs transition-all flex flex-col items-center gap-1.5 disabled:opacity-50 shadow-md shadow-zinc-900/20 dark:shadow-black/30 border border-zinc-800 dark:border-zinc-700"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-zinc-400">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                  <span className="tracking-wider">{ts3Loading ? 'Łączenie…' : 'TEAMSPEAK 3'}</span>
                </button>
                <a
                  href="ts3server://alleria.pl"
                  title="alleria.pl"
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 hover:bg-violet-50 dark:hover:bg-violet-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-violet-300 dark:hover:border-violet-500/30 text-zinc-500 dark:text-zinc-500 hover:text-violet-600 dark:hover:text-violet-400 text-[10px] font-semibold transition-all no-underline group"
                >
                  <ExternalLink className="w-2.5 h-2.5 shrink-0 group-hover:scale-110 transition-transform" />
                  <span>Połącz z TS3</span>
                </a>
              </div>

              {/* TS6 */}
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={handleTeamspeakLogin}
                  disabled={ts3Loading || tsLoading}
                  className="w-full py-3 px-3 bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 active:scale-[0.98] text-white rounded-xl font-bold text-xs transition-all flex flex-col items-center gap-1.5 disabled:opacity-50 shadow-md shadow-zinc-900/20 dark:shadow-black/30 border border-zinc-800 dark:border-zinc-700"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-zinc-400">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                  <span className="tracking-wider">{tsLoading ? 'Łączenie…' : 'TEAMSPEAK 6'}</span>
                </button>
                <a
                  href="teamspeak://ts6.alleria.pl"
                  title="ts6.alleria.pl"
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 hover:bg-violet-50 dark:hover:bg-violet-500/10 border border-zinc-200 dark:border-zinc-800 hover:border-violet-300 dark:hover:border-violet-500/30 text-zinc-500 dark:text-zinc-500 hover:text-violet-600 dark:hover:text-violet-400 text-[10px] font-semibold transition-all no-underline group"
                >
                  <ExternalLink className="w-2.5 h-2.5 shrink-0 group-hover:scale-110 transition-transform" />
                  <span>Połącz z TS6</span>
                </a>
              </div>
            </div>

            {/* TS error messages — aligned under each column */}
            {(ts3Error || ts6Error) && (
              <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                <div>
                  {ts3Error && (
                    <div className="p-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-[10px] leading-snug flex items-start gap-1.5">
                      <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>{ts3Error}</span>
                    </div>
                  )}
                </div>
                <div>
                  {ts6Error && (
                    <div className="p-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-[10px] leading-snug flex items-start gap-1.5">
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
              className="w-full flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors pt-1"
            >
              <Info className="w-3 h-3 shrink-0" />
              <span>Jak działa logowanie przez TeamSpeak?</span>
              <ChevronDown className={`w-3 h-3 ml-auto shrink-0 transition-transform duration-200 ${tsInfoOpen ? 'rotate-180' : ''}`} />
            </button>

            {tsInfoOpen && (
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 space-y-1.5 pl-3 border-l-2 border-violet-500/30 pb-1">
                <p>• Musisz być <span className="font-semibold text-zinc-700 dark:text-zinc-300">aktywnie połączony</span> z serwerem TS w momencie logowania.</p>
                <p>• Weryfikacja działa przez <span className="font-semibold text-zinc-700 dark:text-zinc-300">dopasowanie IP</span> - nie używaj VPN.</p>
                <p>• Wymagana jest <span className="font-semibold text-zinc-700 dark:text-zinc-300">odpowiednia grupa serwerowa</span> na TS.</p>
                <p>• Po dopasowaniu bot wyśle Ci na TeamSpeaku <span className="font-semibold text-zinc-700 dark:text-zinc-300">6-znakowy kod</span> - wpisz go, aby się zalogować.</p>
              </div>
            )}
          </div>

          {/* ── Divider ── */}
          <div className="my-6 border-t border-zinc-100 dark:border-zinc-900 anim-stagger-5" />

          {/* ── Regulamin acceptance ── */}
          <p className="text-center text-xs text-zinc-400 dark:text-zinc-600 anim-stagger-5">
            Logując się akceptujesz{' '}
            <button
              onClick={() => setRegulaminOpen(true)}
              className="text-violet-500 hover:text-violet-400 underline underline-offset-2 transition-colors font-medium"
            >
              Regulamin
            </button>
            {' '}platformy Alleria Filmy.
          </p>

          {/* Mobile footer */}
          <p className="lg:hidden mt-6 text-center text-xs text-zinc-300 dark:text-zinc-700">
            © 2025–{getCurrentYear()} Alleria.pl · built by{' '}
            <a href="https://github.com/mrfroncu" target="_blank" rel="noopener noreferrer"
               className="text-zinc-400 dark:text-zinc-600 hover:text-violet-500 transition-colors">Matthew</a>
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════
          REGULAMIN MODAL
          ══════════════════════════════════════ */}
      {regulaminOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
          onClick={(e) => { if (e.target === e.currentTarget) setRegulaminOpen(false); }}
        >
          <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-white/10 max-h-[90vh] flex flex-col animate-slide-up">
            <div className="flex items-start justify-between px-7 py-6 border-b border-zinc-100 dark:border-white/10 shrink-0">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">Regulamin platformy Alleria Filmy</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Ostatnia aktualizacja: {REGULAMIN_LAST_MODIFIED}</p>
              </div>
              <button
                onClick={() => setRegulaminOpen(false)}
                className="btn-icon-zinc w-8 h-8 !p-0 rounded-full shrink-0 ml-4 mt-0.5"
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

      {/* ══════════════════════════════════════
          TS LOGIN CHALLENGE MODAL
          ══════════════════════════════════════ */}
      <TsChallengeModal
        challenge={challenge}
        code={challengeCode}
        onCodeChange={setChallengeCode}
        onSubmit={handleChallengeSubmit}
        onCancel={cancelChallenge}
        loading={challengeLoading}
        error={challengeError}
        multipleCandidates={challenge?.multipleCandidates}
        count={challenge?.count}
      />
    </div>
  );
}
