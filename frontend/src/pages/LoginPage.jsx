import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Film, MessageSquare, Radio, AlertTriangle, Loader2, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/apiClient';
import Button from '../components/ui/Button';
import Input, { Label } from '../components/ui/Input';
import Card from '../components/ui/Card';

const ERROR_MESSAGES = {
  not_member: 'To konto nie jest członkiem naszej społeczności Discord.',
  no_role: 'Twoje konto nie ma wymaganej roli do zalogowania się.',
  auth_failed: 'Logowanie nie powiodło się. Spróbuj ponownie.',
  no_code: 'Brak kodu autoryzacji z Discorda.',
  config_missing: 'Logowanie przez Discord nie jest skonfigurowane na serwerze.',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refresh } = useAuth();
  const returnTo = searchParams.get('returnTo') || '/';
  const urlError = searchParams.get('error');

  const [health, setHealth] = useState(null);
  const [tsMethod, setTsMethod] = useState(null); // 'ts3' | 'ts6' | null
  const [tsLoading, setTsLoading] = useState(false);
  const [challenge, setChallenge] = useState(null); // { challengeId, nickname, method, expiresIn }
  const [code, setCode] = useState('');
  const [error, setError] = useState(urlError ? (ERROR_MESSAGES[urlError] || 'Wystąpił błąd logowania.') : null);
  const popupRef = useRef(null);

  useEffect(() => {
    api.getHealth().then(setHealth).catch(() => {});
  }, []);

  const finishLogin = useCallback(async () => {
    await refresh();
    navigate(returnTo, { replace: true });
  }, [refresh, navigate, returnTo]);

  useEffect(() => {
    const onMessage = (e) => {
      if (e.data?.type === 'discord_auth_success') {
        popupRef.current?.close?.();
        finishLogin();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [finishLogin]);

  const startDiscordLogin = () => {
    const url = `/api/auth/discord?popup=1&returnTo=${encodeURIComponent(returnTo)}`;
    const popup = window.open(url, 'discord-auth', 'width=480,height=720');
    if (!popup) {
      window.location.href = `/api/auth/discord?returnTo=${encodeURIComponent(returnTo)}`;
      return;
    }
    popupRef.current = popup;
  };

  const startTsLogin = async (method) => {
    setError(null);
    setTsLoading(true);
    setTsMethod(method);
    try {
      const res = method === 'ts3' ? await api.loginTeamspeak3() : await api.loginTeamspeak6();
      if (res?.challenge) {
        setChallenge(res);
      }
    } catch (e) {
      setError(humanizeTsError(e.message));
      setTsMethod(null);
    }
    setTsLoading(false);
  };

  const submitCode = async (e) => {
    e.preventDefault();
    if (!challenge) return;
    setError(null);
    setTsLoading(true);
    try {
      if (tsMethod === 'ts3') await api.verifyTeamspeak3(challenge.challengeId, code);
      else await api.verifyTeamspeak6(challenge.challengeId, code);
      await finishLogin();
    } catch (e) {
      setError('Nieprawidłowy lub wygasły kod. Spróbuj ponownie.');
    }
    setTsLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-500 to-teal-500 items-center justify-center p-16">
        <motion.div
          className="absolute -top-20 -left-20 w-96 h-96 rounded-full bg-white/10 blur-3xl"
          animate={{ y: [0, 30, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-24 -right-10 w-96 h-96 rounded-full bg-teal-300/20 blur-3xl"
          animate={{ y: [0, -24, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="relative z-10 text-white max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center mb-6">
            <Film className="w-7 h-7" />
          </div>
          <h1 className="text-4xl font-extrabold font-display leading-tight mb-4">ALLERIA FILMY</h1>
          <p className="text-white/80 leading-relaxed">Prywatna platforma wideo naszej społeczności. Zaloguj się przez Discord albo TeamSpeak, żeby zobaczyć bibliotekę.</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white font-display mb-1">Zaloguj się</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Wybierz metodę logowania.</p>

          {health && health.discordConfigured === false && (
            <div className="mb-4 flex items-start gap-2 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-300 text-xs p-3">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              Serwer nie ma skonfigurowanego logowania przez Discord.
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-300 text-xs p-3">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {!challenge ? (
            <div className="space-y-3">
              <Button onClick={startDiscordLogin} className="w-full">
                <MessageSquare className="w-4 h-4" /> Zaloguj przez Discord
              </Button>
              <Button variant="secondary" onClick={() => startTsLogin('ts3')} disabled={tsLoading} className="w-full">
                {tsLoading && tsMethod === 'ts3' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                Zaloguj przez TeamSpeak 3
              </Button>
              <Button variant="secondary" onClick={() => startTsLogin('ts6')} disabled={tsLoading} className="w-full">
                {tsLoading && tsMethod === 'ts6' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                Zaloguj przez TeamSpeak 6
              </Button>
            </div>
          ) : (
            <Card className="p-5">
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                Wysłaliśmy kod do <strong>{challenge.nickname}</strong> na TeamSpeak. Wpisz go poniżej (ważny {Math.round((challenge.expiresIn || 300) / 60)} min).
              </p>
              <form onSubmit={submitCode} className="space-y-3">
                <div>
                  <Label>Kod</Label>
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="np. A1B2C3"
                    maxLength={8}
                    autoFocus
                    className="text-center tracking-[0.3em] font-mono text-lg"
                  />
                </div>
                <Button type="submit" disabled={tsLoading || !code} className="w-full">
                  {tsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  Potwierdź
                </Button>
                <button
                  type="button"
                  onClick={() => { setChallenge(null); setCode(''); setTsMethod(null); }}
                  className="w-full text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  Anuluj
                </button>
              </form>
            </Card>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function humanizeTsError(message) {
  if (!message) return 'Logowanie przez TeamSpeak nie powiodło się.';
  const m = message.toLowerCase();
  if (m.includes('timeout')) return 'Serwer TeamSpeak nie odpowiada. Spróbuj ponownie później.';
  if (m.includes('ip') || m.includes('not found')) return 'Nie znaleziono Twojego połączenia na serwerze TeamSpeak — upewnij się, że jesteś połączony.';
  if (m.includes('group')) return 'Twoje konto nie ma wymaganej grupy na serwerze TeamSpeak.';
  if (m.includes('config')) return 'Logowanie przez TeamSpeak nie jest poprawnie skonfigurowane.';
  return message;
}
