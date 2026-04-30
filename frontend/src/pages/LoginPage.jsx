import React, { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, Info, X, ChevronDown, ExternalLink } from 'lucide-react';
import { api } from '../utils/api';
import { getCurrentYear } from '../utils/helpers';
import { REGULAMIN_LAST_MODIFIED, RegulaminContent } from '../data/regulamin';

// Maps raw backend/network error messages to user-friendly Polish text.
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

export default function LoginPage() {
  const [tsLoading, setTsLoading]   = useState(false);
  const [ts3Loading, setTs3Loading] = useState(false);
  const [configOk, setConfigOk]     = useState(true);
  const [regulaminOpen, setRegulaminOpen] = useState(false);
  const [tsInfoOpen, setTsInfoOpen] = useState(false);

  // Separate error states for each login method
  const [discordError, setDiscordError] = useState(null);
  const [ts3Error, setTs3Error] = useState(null);
  const [ts6Error, setTs6Error] = useState(null);

  const returnTo = (() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get('returnTo');
    if (r && r.startsWith('/') && !r.startsWith('//') && r !== '/login') return r;
    return '';
  })();

  // Parse URL error params (from Discord OAuth redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (!err) return;
    const map = {
      not_member:     'Nie jesteś członkiem serwera Discord.',
      no_role:        'Nie posiadasz wymaganej roli na serwerze Discord.',
      auth_failed:    'Logowanie nie powiodło się. Spróbuj ponownie.',
      no_code:        'Discord nie zwrócił kodu autoryzacji. Spróbuj ponownie.',
      config_missing: 'Serwer nie jest poprawnie skonfigurowany. Sprawdź plik .env.',
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
      const width = 600, height = 800;
      const left = Math.round(window.screen.width / 2 - width / 2);
      const top  = Math.round(window.screen.height / 2 - height / 2);
      const popup = window.open(authUrl, 'discord_oauth',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,status=no`);
      if (!popup) window.top.location.href = authUrl;
    }
  };

  const handleTeamspeakLogin = async () => {
    setTsLoading(true);
    setTs6Error(null);
    try {
      await api.loginTeamspeak();
      window.location.href = '/';
    } catch (err) {
      setTs6Error(parseTsError(err.message, 'TeamSpeak 6'));
    } finally {
      setTsLoading(false);
    }
  };

  const handleTeamspeak3Login = async () => {
    setTs3Loading(true);
    setTs3Error(null);
    try {
      await api.loginTeamspeak3();
      window.location.href = '/';
    } catch (err) {
      setTs3Error(parseTsError(err.message, 'TeamSpeak 3'));
    } finally {
      setTs3Loading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-zinc-950 p-4 relative overflow-hidden transition-colors duration-300">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/3 -left-1/4 w-[70%] h-[70%] bg-violet-500/10 dark:bg-violet-500/20 rounded-full blur-[100px]" />
        <div className="absolute -bottom-1/3 -right-1/4 w-[70%] h-[70%] bg-fuchsia-600/10 dark:bg-fuchsia-600/20 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-sm w-full relative z-10 animate-slide-up">
        <div className="bg-zinc-50/70 dark:bg-white/5 backdrop-blur-2xl rounded-3xl border border-zinc-200 dark:border-white/10 shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="px-8 pt-8 pb-6">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-white/10 flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/10 overflow-hidden">
                <img src="https://alleria.pl/image/logo-clr.png" alt="Alleria" className="w-9 h-9 object-contain" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display leading-none">ALLERIA</h1>
                <p className="text-xs font-bold tracking-[0.3em] text-violet-500 font-display mt-0.5">FILMY</p>
              </div>
            </div>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">
              Prywatna platforma wideo społeczności Alleria. Zaloguj się, aby uzyskać dostęp.
            </p>
          </div>

          <div className="h-px bg-zinc-200 dark:bg-white/10" />

          {/* Buttons */}
          <div className="px-8 py-6 space-y-3">

            {/* Server config warning */}
            {!configOk && (
              <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Serwer nie skonfigurowany</p>
                  <p className="opacity-75 mt-0.5">Brak danych Discord w .env. Sprawdź konfigurację i uruchom ponownie.</p>
                </div>
              </div>
            )}

            {/* Discord error */}
            {discordError && (
              <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl text-red-700 dark:text-red-300 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{discordError}</span>
              </div>
            )}

            {/* Discord */}
            <a
              href={`/auth/discord${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
              onClick={handleDiscordLogin}
              className="w-full py-3.5 bg-[#5865F2] text-white rounded-2xl font-bold hover:bg-[#4752C4] active:scale-[0.98] transition-all flex items-center justify-center gap-3 shadow-lg shadow-[#5865F2]/25 text-sm no-underline"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z"/>
              </svg>
              Zaloguj przez Discord
            </a>

            {/* Separator */}
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
              </div>
              <div className="relative flex justify-center">
                <span className="px-3 bg-zinc-50/70 dark:bg-zinc-950 text-zinc-400 text-xs font-medium">lub przez TeamSpeak</span>
              </div>
            </div>

            {/* TeamSpeak buttons — TS3 left, TS6 right */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* TS3 */}
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={handleTeamspeak3Login}
                  disabled={tsLoading || ts3Loading}
                  className="w-full py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-bold hover:bg-zinc-800 dark:hover:bg-zinc-100 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-1.5 text-xs disabled:opacity-50 shadow-lg shadow-zinc-900/10"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                  <span>{ts3Loading ? 'Łączenie…' : 'TEAMSPEAK 3'}</span>
                </button>
                <a
                  href="ts3server://alleria.pl"
                  className="flex items-center justify-center gap-1 text-[10px] text-zinc-400 hover:text-violet-500 transition-colors no-underline"
                  title="Otwórz w kliencie TeamSpeak 3"
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                  <span>Dołącz — alleria.pl</span>
                </a>
              </div>

              {/* TS6 */}
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={handleTeamspeakLogin}
                  disabled={tsLoading || ts3Loading}
                  className="w-full py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-bold hover:bg-zinc-800 dark:hover:bg-zinc-100 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-1.5 text-xs disabled:opacity-50 shadow-lg shadow-zinc-900/10"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                  <span>{tsLoading ? 'Łączenie…' : 'TEAMSPEAK 6'}</span>
                </button>
                <a
                  href="teamspeak://ts6.alleria.pl"
                  className="flex items-center justify-center gap-1 text-[10px] text-zinc-400 hover:text-violet-500 transition-colors no-underline"
                  title="Otwórz w kliencie TeamSpeak 6"
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                  <span>Dołącz — ts6.alleria.pl</span>
                </a>
              </div>
            </div>

            {/* TS errors — shown below respective button */}
            {(ts3Error || ts6Error) && (
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  {ts3Error && (
                    <div className="p-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-700 dark:text-red-300 text-[11px] leading-snug flex items-start gap-1.5">
                      <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>{ts3Error}</span>
                    </div>
                  )}
                </div>
                <div>
                  {ts6Error && (
                    <div className="p-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-700 dark:text-red-300 text-[11px] leading-snug flex items-start gap-1.5">
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
              className="w-full flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-500 dark:hover:text-zinc-300 transition-colors pt-0.5"
            >
              <Info className="w-3 h-3 shrink-0" />
              <span>Jak działa logowanie przez TeamSpeak?</span>
              <ChevronDown className={`w-3 h-3 ml-auto shrink-0 transition-transform duration-200 ${tsInfoOpen ? 'rotate-180' : ''}`} />
            </button>

            {tsInfoOpen && (
              <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1.5 pl-3 border-l-2 border-violet-500/30">
                <p>• Musisz być <strong className="text-zinc-700 dark:text-zinc-300">aktywnie połączony</strong> z serwerem TS w momencie logowania.</p>
                <p>• Weryfikacja odbywa się przez <strong className="text-zinc-700 dark:text-zinc-300">dopasowanie adresu IP</strong> — nie używaj VPN zmieniającego Twoje IP.</p>
                <p>• Wymagana jest <strong className="text-zinc-700 dark:text-zinc-300">odpowiednia grupa serwerowa</strong> na TS.</p>
              </div>
            )}
          </div>

          {/* Footer strip — regulamin */}
          <div className="px-8 py-4 bg-zinc-100/50 dark:bg-black/20 border-t border-zinc-200 dark:border-white/10">
            <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
              Logując się akceptujesz{' '}
              <button
                onClick={() => setRegulaminOpen(true)}
                className="text-violet-500 hover:text-violet-400 underline underline-offset-2 transition-colors"
              >
                Regulamin
              </button>
              {' '}platformy Alleria Filmy.
            </p>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-zinc-400 dark:text-zinc-600">
          © 2025–{getCurrentYear()} Alleria.pl · built by{' '}
          <a href="https://github.com/mrfroncu" target="_blank" rel="noopener noreferrer" className="text-violet-500 hover:text-violet-400 transition-colors">
            Matthew
          </a>
        </p>
      </div>

      {/* ===== Regulamin Modal ===== */}
      {regulaminOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setRegulaminOpen(false); }}
        >
          <div className="relative w-full max-w-xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-white/10 max-h-[90vh] flex flex-col animate-slide-up">
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100 dark:border-white/10 shrink-0">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">Regulamin platformy Alleria Filmy</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Ostatnia aktualizacja: {REGULAMIN_LAST_MODIFIED}</p>
              </div>
              <button
                onClick={() => setRegulaminOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/20 transition-colors shrink-0 ml-4"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5 space-y-6 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <RegulaminContent />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
