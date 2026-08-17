import React from 'react';
import { Wrench, Lock, LogOut } from 'lucide-react';

function Shell({ children }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-white dark:bg-zinc-950 px-6 py-12 relative overflow-hidden">
      <div className="absolute -top-32 -right-32 w-64 h-64 bg-violet-500/10 dark:bg-violet-500/20 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-fuchsia-600/10 dark:bg-fuchsia-600/20 rounded-full blur-[80px] pointer-events-none" />
      <div className="card w-full max-w-sm p-8 text-center relative z-10">
        {children}
      </div>
    </div>
  );
}

function Badge({ icon: Icon }) {
  return (
    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-violet-500/20">
      <Icon className="w-6 h-6 text-white" />
    </div>
  );
}

// Anonymous visitor while maintenance mode is ON — shown in place of the normal LoginPage
// form. The Discord button stays deliberately small/secondary: this screen isn't an
// invitation to log in, it's an escape hatch for a dev to get in and flip the setting back.
export function MaintenanceNotice() {
  const returnTo = (() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get('returnTo');
    return r && r.startsWith('/') && !r.startsWith('//') ? r : '';
  })();

  return (
    <Shell>
      <Badge icon={Wrench} />
      <h1 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Przerwa techniczna</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        Trwają prace konserwacyjne. Platforma wróci za chwilę — spróbuj ponownie za kilka minut.
      </p>
      <a
        href={`/auth/discord${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
        className="inline-flex items-center gap-2 py-2 px-4 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-xl text-xs font-medium transition-colors no-underline"
      >
        Zaloguj przez Discord
      </a>
    </Shell>
  );
}

// Logged-in but non-dev user while maintenance mode is ON — only role 'dev' passes through
// ProtectedRoute during maintenance; everyone else lands here instead of the app.
export function MaintenanceBlocked({ onLogout }) {
  return (
    <Shell>
      <Badge icon={Lock} />
      <h1 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Brak dostępu</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        Trwa przerwa techniczna. W tym czasie dostęp ma wyłącznie zespół deweloperski — wróć za chwilę.
      </p>
      <button
        onClick={onLogout}
        className="inline-flex items-center gap-2 py-2.5 px-5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90 rounded-xl text-sm font-semibold transition-opacity"
      >
        <LogOut className="w-4 h-4" />
        Wyloguj się
      </button>
    </Shell>
  );
}
