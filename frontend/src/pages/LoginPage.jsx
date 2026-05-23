import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, AlertCircle, Info, X, ChevronDown, ExternalLink, Film, Users, ShieldCheck } from 'lucide-react';
import { api } from '../utils/api';
import { getCurrentYear } from '../utils/helpers';
import { REGULAMIN_LAST_MODIFIED, RegulaminContent } from '../data/regulamin';

function parseTsError(msg, version) {
  if (!msg) return `Logowanie przez ${version} nie powiodło się.`;
  const m = msg.toLowerCase();
  if (m.includes('timeout') || m.includes('econnrefused') || m.includes('enotfound') || m.includes('connect'))
    return `Nie można połączyć się z serwerem ${version}. Serwer jest niedostępny lub adres jest błędny.`;
  if (m.includes('ip') || m.includes('nie znaleziono klienta') || m.includes('znaleziono'))
    return `Nie znaleziono Twojego IP na serwerze ${version}. Upewnij się, że jesteś aktywnie połączony.`;
  if (m.includes('grupy') || m.includes('group') || m.includes('wymaganej'))
    return `Nie posiadasz wymaganej grupy serwerowej na ${version}.`;
  if (m.includes('invalid_password') || m.includes('520') || m.includes('konfiguracji serwera'))
    return `Błąd konfiguracji — nieprawidłowe dane administracyjne ${version}. Skontaktuj się z administratorem.`;
  if (m.includes('closed unexpectedly') || m.includes('socket'))
    return `Połączenie z serwerem ${version} zostało przerwane. Spróbuj ponownie.`;
  return msg;
}

export default function LoginPage() {
  const [tsLoading, setTsLoading]       = useState(false);
  const [ts3Loading, setTs3Loading]     = useState(false);
  const [configOk, setConfigOk]         = useState(true);
  const [regulaminOpen, setRegulaminOpen] = useState(false);
  const [tsInfoOpen, setTsInfoOpen]     = useState(false);
  const [discordError, setDiscordError] = useState(null);
  const [ts3Error, setTs3Error]         = useState(null);
  const [ts6Error, setTs6Error]         = useState(null);
  const cursorRef = useRef(null);

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

  // Cursor light
  useEffect(() => {
    const el = cursorRef.current;
    if (!el) return;
    const onMove = (e) => { el.style.left = e.clientX + 'px'; el.style.top = e.clientY + 'px'; };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

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

  const handleTeamspeakLogin = async () => {
    setTsLoading(true); setTs6Error(null);
    try { await api.loginTeamspeak(); window.location.href = '/'; }
    catch (err) { setTs6Error(parseTsError(err.message, 'TeamSpeak 6')); }
    finally { setTsLoading(false); }
  };

  const handleTeamspeak3Login = async () => {
    setTs3Loading(true); setTs3Error(null);
    try { await api.loginTeamspeak3(); window.location.href = '/'; }
    catch (err) { setTs3Error(parseTsError(err.message, 'TeamSpeak 3')); }
    finally { setTs3Loading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: 'var(--bg-0)' }}>

      {/* Cursor light */}
      <div ref={cursorRef} className="cursor-light" />

      {/* Ambient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div className="absolute rounded-full"
          style={{ width: '55vw', height: '55vw', background: 'var(--ember)', opacity: 0.10, top: '-20%', left: '-15%', filter: 'blur(120px)', animation: 'float1 24s ease-in-out infinite' }} />
        <div className="absolute rounded-full"
          style={{ width: '50vw', height: '50vw', background: 'var(--violet-a)', opacity: 0.08, bottom: '-20%', right: '-15%', filter: 'blur(120px)', animation: 'float2 28s ease-in-out infinite' }} />
        <div className="absolute rounded-full"
          style={{ width: '40vw', height: '40vw', background: 'var(--cyber)', opacity: 0.05, top: '40%', left: '30%', filter: 'blur(120px)', animation: 'float3 32s ease-in-out infinite' }} />
      </div>

      {/* ═══════════════════════════════
          LEFT PANEL — branding (desktop)
          ═══════════════════════════════ */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] relative overflow-hidden flex-col" style={{ zIndex: 4 }}>

        {/* Layered background */}
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse 80% 60% at 20% 30%, rgba(255,91,46,0.18) 0%, transparent 60%), var(--bg-1)',
        }} />
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(246,246,250,1) 1px, transparent 1px), linear-gradient(90deg, rgba(246,246,250,1) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, #000 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, #000 30%, transparent 75%)',
        }} />
        {/* Scan lines */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.009) 3px, rgba(255,255,255,0.009) 4px)',
        }} />
        {/* Right separator */}
        <div className="absolute inset-y-0 right-0 w-px" style={{ background: 'var(--line-2)' }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full p-12 xl:p-16">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden"
              style={{ background: 'rgba(255,91,46,0.08)', border: '1px solid rgba(255,91,46,0.22)' }}>
              <img src="https://alleria.pl/image/favicon.png" alt="Alleria" className="w-6 h-6 object-contain" />
            </div>
            <span className="text-xs font-semibold tracking-[0.2em] uppercase font-mono" style={{ color: 'var(--fg-3)' }}>Alleria.pl</span>
          </div>

          {/* Hero */}
          <div className="flex-1 flex flex-col justify-center py-12">
            <p className="text-xs font-bold tracking-[0.28em] uppercase font-mono mb-5" style={{ color: 'var(--ember)' }}>
              Prywatna platforma wideo
            </p>

            <h1 className="font-black text-white leading-[1.05] tracking-tight mb-6"
              style={{ fontSize: 'clamp(48px, 6vw, 80px)' }}>
              Filmy<br />
              <span style={{
                background: 'linear-gradient(135deg, var(--ember-2) 0%, var(--ember) 50%, #d54420 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                społeczności.
              </span>
            </h1>

            <p className="text-base xl:text-lg leading-relaxed max-w-xs xl:max-w-sm mb-12" style={{ color: 'var(--fg-3)' }}>
              Archiwum wspomnień, nagrane sesje, wspólne chwile — wszystko w jednym miejscu, wyłącznie dla członków Alleria.
            </p>

            {/* Feature badges */}
            <div className="flex flex-col gap-3">
              {[
                { icon: Film,        label: 'Biblioteka filmów i nagrań' },
                { icon: Users,       label: 'Dostęp tylko dla społeczności' },
                { icon: ShieldCheck, label: 'Bezpieczne logowanie przez Discord i TeamSpeak' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(255,91,46,0.08)', border: '1px solid rgba(255,91,46,0.18)' }}>
                    <Icon className="w-4 h-4" style={{ color: 'var(--ember-2)' }} />
                  </div>
                  <span className="text-sm" style={{ color: 'var(--fg-3)' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Copyright */}
          <p className="text-xs font-mono" style={{ color: 'var(--fg-4)' }}>
            © 2025–{getCurrentYear()} Alleria.pl · built by{' '}
            <a href="https://github.com/mrfroncu" target="_blank" rel="noopener noreferrer"
              className="transition-opacity hover:opacity-70" style={{ color: 'var(--fg-3)' }}>Matthew</a>
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════
          RIGHT PANEL — login form
          ═══════════════════════════════ */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen lg:min-h-0 px-6 py-12 relative" style={{ zIndex: 4 }}>

        {/* Mobile blobs */}
        <div className="lg:hidden absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-32 -right-32 w-64 h-64 rounded-full"
            style={{ background: 'var(--ember)', opacity: 0.08, filter: 'blur(80px)' }} />
          <div className="absolute -bottom-32 -left-32 w-64 h-64 rounded-full"
            style={{ background: 'var(--violet-a)', opacity: 0.06, filter: 'blur(80px)' }} />
        </div>

        <div className="w-full max-w-[360px] relative z-10">

          {/* Mobile header */}
          <div className="lg:hidden text-center mb-10">
            <div className="w-16 h-16 rounded-[22px] flex items-center justify-center mx-auto mb-4 shadow-xl overflow-hidden"
              style={{ background: 'rgba(255,91,46,0.08)', border: '1px solid rgba(255,91,46,0.22)', boxShadow: '0 8px 32px rgba(255,91,46,0.15)' }}>
              <img src="https://alleria.pl/image/logo-clr.png" alt="Alleria" className="w-11 h-11 object-contain" />
            </div>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--fg)' }}>ALLERIA</h1>
            <p className="text-xs font-bold tracking-[0.35em] mt-0.5 font-mono" style={{ color: 'var(--ember)' }}>FILMY</p>
          </div>

          {/* Form heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--fg)' }}>Zaloguj się</h2>
            <p className="text-sm" style={{ color: 'var(--fg-3)' }}>Dostęp mają wyłącznie członkowie społeczności Alleria.</p>
          </div>

          {/* Config warning */}
          {!configOk && (
            <div className="mb-5 p-3.5 rounded-2xl flex items-start gap-3 text-xs"
              style={{ background: 'rgba(245,185,88,0.08)', border: '1px solid rgba(245,185,88,0.20)', color: 'var(--warn)' }}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-0.5">Serwer nie skonfigurowany</p>
                <p className="opacity-75">Brak danych Discord w pliku .env. Sprawdź konfigurację i zrestartuj serwer.</p>
              </div>
            </div>
          )}

          {/* Discord error */}
          {discordError && (
            <div className="mb-5 p-3.5 rounded-2xl flex items-start gap-3 text-xs"
              style={{ background: 'rgba(239,111,108,0.08)', border: '1px solid rgba(239,111,108,0.20)', color: 'var(--err)' }}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{discordError}</span>
            </div>
          )}

          {/* Discord button */}
          <a
            href={`/auth/discord${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
            onClick={handleDiscordLogin}
            className="group w-full flex items-center justify-center gap-3 py-3.5 px-5 text-white font-semibold rounded-2xl transition-all text-sm no-underline active:scale-[0.98]"
            style={{
              background: '#5865F2',
              boxShadow: '0 4px 20px rgba(88,101,242,0.30)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#4752C4'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(88,101,242,0.45)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#5865F2'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(88,101,242,0.30)'; }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z"/>
            </svg>
            Zaloguj przez Discord
          </a>

          {/* Separator */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full h-px" style={{ background: 'var(--line-2)' }} />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 text-xs font-medium font-mono" style={{ background: 'var(--bg-0)', color: 'var(--fg-4)' }}>
                lub przez TeamSpeak
              </span>
            </div>
          </div>

          {/* TeamSpeak section */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2.5">
              {/* TS3 */}
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={handleTeamspeak3Login}
                  disabled={ts3Loading || tsLoading}
                  className="w-full py-3 px-3 text-white rounded-xl font-bold text-xs transition-all flex flex-col items-center gap-1.5 disabled:opacity-50"
                  style={{
                    background: 'var(--bg-3)',
                    border: '1px solid var(--line-2)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-4)'; e.currentTarget.style.borderColor = 'var(--line-2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-3)'; }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--fg-3)' }}>
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                  <span className="tracking-wider" style={{ color: 'var(--fg-2)' }}>{ts3Loading ? 'Łączenie…' : 'TEAMSPEAK 3'}</span>
                </button>
                <a
                  href="ts3server://alleria.pl"
                  title="alleria.pl"
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-semibold transition-all no-underline group"
                  style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--fg-4)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--ember-2)'; e.currentTarget.style.borderColor = 'rgba(255,91,46,0.25)'; e.currentTarget.style.background = 'rgba(255,91,46,0.05)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-4)'; e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.background = 'var(--bg-2)'; }}
                >
                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  <span>Połącz z TS3</span>
                </a>
              </div>

              {/* TS6 */}
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={handleTeamspeakLogin}
                  disabled={ts3Loading || tsLoading}
                  className="w-full py-3 px-3 text-white rounded-xl font-bold text-xs transition-all flex flex-col items-center gap-1.5 disabled:opacity-50"
                  style={{
                    background: 'var(--bg-3)',
                    border: '1px solid var(--line-2)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-4)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-3)'; }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--fg-3)' }}>
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                  <span className="tracking-wider" style={{ color: 'var(--fg-2)' }}>{tsLoading ? 'Łączenie…' : 'TEAMSPEAK 6'}</span>
                </button>
                <a
                  href="teamspeak://ts6.alleria.pl"
                  title="ts6.alleria.pl"
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-semibold transition-all no-underline group"
                  style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--fg-4)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--ember-2)'; e.currentTarget.style.borderColor = 'rgba(255,91,46,0.25)'; e.currentTarget.style.background = 'rgba(255,91,46,0.05)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-4)'; e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.background = 'var(--bg-2)'; }}
                >
                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  <span>Połącz z TS6</span>
                </a>
              </div>
            </div>

            {/* TS errors */}
            {(ts3Error || ts6Error) && (
              <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                <div>
                  {ts3Error && (
                    <div className="p-2.5 rounded-xl text-[10px] leading-snug flex items-start gap-1.5"
                      style={{ background: 'rgba(239,111,108,0.08)', border: '1px solid rgba(239,111,108,0.20)', color: 'var(--err)' }}>
                      <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>{ts3Error}</span>
                    </div>
                  )}
                </div>
                <div>
                  {ts6Error && (
                    <div className="p-2.5 rounded-xl text-[10px] leading-snug flex items-start gap-1.5"
                      style={{ background: 'rgba(239,111,108,0.08)', border: '1px solid rgba(239,111,108,0.20)', color: 'var(--err)' }}>
                      <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>{ts6Error}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TS info */}
            <button
              onClick={() => setTsInfoOpen(v => !v)}
              className="w-full flex items-center gap-1.5 text-[11px] transition-colors pt-1"
              style={{ color: 'var(--fg-4)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--fg-3)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-4)'; }}
            >
              <Info className="w-3 h-3 shrink-0" />
              <span>Jak działa logowanie przez TeamSpeak?</span>
              <ChevronDown className={`w-3 h-3 ml-auto shrink-0 transition-transform duration-200 ${tsInfoOpen ? 'rotate-180' : ''}`} />
            </button>

            {tsInfoOpen && (
              <div className="text-[11px] space-y-1.5 pl-3 pb-1" style={{ color: 'var(--fg-3)', borderLeft: '2px solid rgba(255,91,46,0.25)' }}>
                <p>• Musisz być <span className="font-semibold" style={{ color: 'var(--fg-2)' }}>aktywnie połączony</span> z serwerem TS w momencie logowania.</p>
                <p>• Weryfikacja działa przez <span className="font-semibold" style={{ color: 'var(--fg-2)' }}>dopasowanie IP</span> — nie używaj VPN, który zmienia Twój adres.</p>
                <p>• Wymagana jest <span className="font-semibold" style={{ color: 'var(--fg-2)' }}>odpowiednia grupa serwerowa</span> na TS.</p>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="my-6 h-px" style={{ background: 'var(--line)' }} />

          {/* Regulamin */}
          <p className="text-center text-xs" style={{ color: 'var(--fg-4)' }}>
            Logując się akceptujesz{' '}
            <button
              onClick={() => setRegulaminOpen(true)}
              className="underline underline-offset-2 transition-colors font-medium"
              style={{ color: 'var(--ember-2)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--ember)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--ember-2)'; }}
            >
              Regulamin
            </button>
            {' '}platformy Alleria Filmy.
          </p>

          {/* Mobile footer */}
          <p className="lg:hidden mt-6 text-center text-xs font-mono" style={{ color: 'var(--fg-4)' }}>
            © 2025–{getCurrentYear()} Alleria.pl · built by{' '}
            <a href="https://github.com/mrfroncu" target="_blank" rel="noopener noreferrer"
              className="transition-colors" style={{ color: 'var(--fg-3)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--ember)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-3)'; }}>Matthew</a>
          </p>
        </div>
      </div>

      {/* ═══════════════════
          REGULAMIN MODAL
          ═══════════════════ */}
      {regulaminOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(10,10,16,0.80)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setRegulaminOpen(false); }}
        >
          <div className="relative w-full max-w-2xl rounded-3xl shadow-2xl max-h-[90vh] flex flex-col animate-slide-up"
            style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)' }}>
            <div className="flex items-start justify-between px-7 py-6 shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
              <div>
                <h2 className="text-base font-bold" style={{ color: 'var(--fg)' }}>Regulamin platformy Alleria Filmy</h2>
                <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--fg-4)' }}>Ostatnia aktualizacja: {REGULAMIN_LAST_MODIFIED}</p>
              </div>
              <button
                onClick={() => setRegulaminOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full transition-colors shrink-0 ml-4 mt-0.5"
                style={{ background: 'rgba(246,246,250,0.06)', color: 'var(--fg-3)', border: '1px solid var(--line)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(246,246,250,0.10)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(246,246,250,0.06)'; }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-7 py-6 space-y-6 text-sm leading-relaxed" style={{ color: 'var(--fg-3)' }}>
              <RegulaminContent />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
