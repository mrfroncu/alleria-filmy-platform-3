import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';
import { getCurrentYear } from '../utils/helpers';

export default function LoginPage() {
  const [tsLoading, setTsLoading] = useState(false);
  const [ts3Loading, setTs3Loading] = useState(false);
  const [configOk, setConfigOk] = useState(true);

  // Get returnTo from URL — set by ProtectedRoute redirect
  // Only allow relative same-origin paths (starts with / but not //) to prevent open redirect attacks.
  const returnTo = (() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get('returnTo');
    if (r && r.startsWith('/') && !r.startsWith('//') && r !== '/login') return r;
    return '';
  })();

  const [error, setError] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err === 'not_member') return 'Nie jesteś członkiem serwera Discord.';
    if (err === 'no_role') return 'Nie posiadasz wymaganej roli na serwerze Discord.';
    if (err === 'auth_failed') return 'Logowanie nie powiodło się. Spróbuj ponownie.';
    if (err === 'no_code') return 'Discord nie zwrócił kodu autoryzacji. Spróbuj ponownie.';
    if (err === 'config_missing') return 'Serwer nie jest poprawnie skonfigurowany. Sprawdź plik .env.';
    return null;
  });

  // Check server config on mount
  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(data => {
        if (!data.discord_configured) {
          setConfigOk(false);
        }
      })
      .catch(() => setConfigOk(false));
  }, []);

  // Listen for auth success message from the popup (when we are the opener inside the iframe)
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'discord_auth_success') {
        // Re-validate returnTo before navigating to guard against open redirect
        const dest = (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) ? returnTo : '/';
        window.location.href = dest;
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [returnTo]);

  // Handle Discord login button click — open a popup when embedded in an iframe
  // because Discord blocks its OAuth page from being loaded inside iframes.
  const handleDiscordLogin = (e) => {
    const inIframe = window.self !== window.top;
    if (inIframe) {
      e.preventDefault();
      const authUrl = '/auth/discord?popup=true';
      const width = 600;
      const height = 800;
      const left = Math.round(window.screen.width / 2 - width / 2);
      const top = Math.round(window.screen.height / 2 - height / 2);
      const popup = window.open(
        authUrl,
        'discord_oauth',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,status=no`
      );
      // Fall back to top-level navigation if the popup was blocked by the browser
      if (!popup) {
        window.top.location.href = authUrl;
      }
    }
    // Not in an iframe — let the <a> tag navigate normally
  };

  const handleTeamspeakLogin = async () => {
    setTsLoading(true);
    setError(null);
    try {
      await api.loginTeamspeak();
      window.location.href = '/';
    } catch (err) {
      setError(err.message || 'Logowanie przez TeamSpeak 6 nie powiodło się.');
    } finally {
      setTsLoading(false);
    }
  };

  const handleTeamspeak3Login = async () => {
    setTs3Loading(true);
    setError(null);
    try {
      await api.loginTeamspeak3();
      window.location.href = '/';
    } catch (err) {
      setError(err.message || 'Logowanie przez TeamSpeak 3 nie powiodło się.');
    } finally {
      setTs3Loading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-zinc-950 p-4 text-center relative overflow-hidden transition-colors duration-300">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-1/4 -left-1/4 w-[80%] h-[80%] bg-violet-500/10 dark:bg-violet-500/20 rounded-full blur-[120px]" />
        <div className="absolute -bottom-1/4 -right-1/4 w-[80%] h-[80%] bg-fuchsia-600/10 dark:bg-fuchsia-600/20 rounded-full blur-[120px]" />
      </div>

      <div className="max-w-md w-full bg-zinc-50/50 dark:bg-white/5 backdrop-blur-2xl p-8 sm:p-12 rounded-[48px] shadow-2xl border border-zinc-200 dark:border-white/10 relative z-10 animate-slide-up">
        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 rounded-[32px] flex items-center justify-center mx-auto mb-8 sm:mb-10 shadow-2xl shadow-violet-500/20 border border-white/10 overflow-hidden">
          <img src="https://alleria.pl/image/logo-clr.png" alt="Alleria" className="w-16 h-16 sm:w-20 sm:h-20 object-contain" />
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-2 text-zinc-900 dark:text-white font-display">ALLERIA</h1>
        <p className="text-lg sm:text-xl font-bold tracking-[0.3em] text-violet-500 mb-6 font-display">FILMY</p>
        <p className="text-zinc-500 dark:text-zinc-400 mb-8 sm:mb-12 leading-relaxed text-base sm:text-lg">
          Prywatna platforma wideo społeczności Alleria. Zaloguj się, aby uzyskać dostęp.
        </p>

        {!configOk && (
          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl text-amber-700 dark:text-amber-300 text-sm font-medium animate-slide-up flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold mb-1">Serwer nie skonfigurowany</p>
              <p className="text-xs opacity-80">Brak danych Discord w pliku .env. Sprawdź konfigurację serwera i uruchom ponownie. Otwórz <code className="bg-amber-200/50 dark:bg-amber-500/20 px-1 rounded">/api/health</code> by zobaczyć status.</p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl text-red-700 dark:text-red-300 text-sm font-medium animate-slide-up">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Discord login — uses a popup when embedded in an iframe to bypass Discord's iframe restrictions */}
          <a
            href={`/auth/discord${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
            onClick={handleDiscordLogin}
            className="w-full py-4 sm:py-5 bg-[#5865F2] text-white rounded-2xl font-bold hover:bg-[#4752C4] transition-all active:scale-[0.98] flex items-center justify-center gap-4 shadow-xl shadow-[#5865F2]/20 text-base sm:text-lg no-underline"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z"/>
            </svg>
            Zaloguj przez Discord
          </a>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-4 bg-zinc-50/50 dark:bg-zinc-950 text-zinc-400 font-medium">lub</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleTeamspeakLogin}
              disabled={tsLoading || ts3Loading}
              className="py-4 sm:py-5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-bold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all active:scale-[0.98] flex flex-col items-center justify-center gap-2 shadow-xl shadow-zinc-900/10 dark:shadow-white/10 text-sm disabled:opacity-50"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              <span>{tsLoading ? 'Łączenie...' : 'TEAMSPEAK 6'}</span>
            </button>
            <button
              onClick={handleTeamspeak3Login}
              disabled={tsLoading || ts3Loading}
              className="py-4 sm:py-5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-bold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all active:scale-[0.98] flex flex-col items-center justify-center gap-2 shadow-xl shadow-zinc-900/10 dark:shadow-white/10 text-sm disabled:opacity-50"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              <span>{ts3Loading ? 'Łączenie...' : 'TEAMSPEAK 3'}</span>
            </button>
          </div>
        </div>
      </div>

      <p className="mt-8 text-xs text-zinc-400 dark:text-zinc-600 relative z-10">
        © 2025 - {getCurrentYear()} Alleria.pl | built by{' '}
        <a href="https://github.com/mrfroncu" target="_blank" rel="noopener noreferrer" className="text-violet-500 hover:text-violet-400 transition-colors">Matthew</a>
      </p>
    </div>
  );
}
