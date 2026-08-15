import React from 'react';
import { Wrench, Lock, LogOut } from 'lucide-react';

// Full-viewport takeover, styled after LoginPage's dark branding panel — deliberately NOT a
// bounded card floating on a page, so it reads as its own distinct screen rather than a popup
// over the normal app.
function Shell({ children }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-zinc-950 relative overflow-hidden px-6 py-12">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-950 via-zinc-950 to-zinc-950" />
      <div className="absolute -top-48 -left-48 w-[600px] h-[600px] bg-violet-600/25 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-fuchsia-700/20 rounded-full blur-[110px] pointer-events-none" />
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '32px 32px' }}
      />
      <div className="relative z-10 max-w-lg w-full text-center">
        {children}
      </div>
    </div>
  );
}

function Badge({ icon: Icon }) {
  return (
    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mx-auto mb-8 shadow-xl shadow-violet-500/30">
      <Icon className="w-8 h-8 text-white" />
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
      <p className="text-violet-400 text-xs font-semibold tracking-[0.25em] uppercase mb-4">Alleria Filmy</p>
      <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight tracking-tight mb-5">Przerwa techniczna</h1>
      <p className="text-zinc-400 text-base leading-relaxed mb-10 max-w-sm mx-auto">
        Trwają prace konserwacyjne. Platforma wróci za chwilę — spróbuj ponownie za kilka minut.
      </p>
      <a
        href={`/auth/discord${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
        className="inline-flex items-center gap-2 py-2 px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-500 hover:text-zinc-300 rounded-xl text-xs font-medium transition-colors no-underline"
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
      <p className="text-violet-400 text-xs font-semibold tracking-[0.25em] uppercase mb-4">Alleria Filmy</p>
      <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight tracking-tight mb-5">Brak dostępu</h1>
      <p className="text-zinc-400 text-base leading-relaxed mb-10 max-w-sm mx-auto">
        Trwa przerwa techniczna. W tym czasie dostęp ma wyłącznie zespół deweloperski — wróć za chwilę.
      </p>
      <button
        onClick={onLogout}
        className="inline-flex items-center gap-2 py-3.5 px-6 bg-gradient-to-br from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-violet-500/20 transition-all active:scale-[0.97]"
      >
        <LogOut className="w-4 h-4" />
        Wyloguj się
      </button>
    </Shell>
  );
}
