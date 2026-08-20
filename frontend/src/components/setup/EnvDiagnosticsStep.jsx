import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { api } from '../../utils/api';
import { StatusRow } from './SetupUI';

// Purely informational — everything here lives in .env, which this running container can read
// but never write (that requires editing the file on the host and restarting). If something's
// red, the fix is always ".env + docker compose up -d --build", never a form on this page.
export default function EnvDiagnosticsStep() {
  const [health, setHealth] = useState(null);
  const [envCheck, setEnvCheck] = useState(null);

  useEffect(() => {
    api.getHealth().then(setHealth).catch(() => {});
    api.envCheck().then(setEnvCheck).catch(() => {});
  }, []);

  return (
    <div>
      <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mb-5">
        <ShieldCheck className="w-6 h-6 text-blue-500" />
      </div>
      <h2 className="text-xl font-bold text-zinc-900 dark:text-white font-display mb-2">Diagnostyka .env</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-6">
        Skoro jesteś tu zalogowany jako dev, podstawy Discorda już działają. Poniżej pełny status —
        przydatny, jeśli chcesz też wpuścić zwykłych członków (rola Member) albo redaktorów.
      </p>

      {!health ? (
        <div className="h-32 skeleton rounded-2xl" />
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800 mb-6">
          <StatusRow ok={health.discord_configured} label="Discord skonfigurowany (Client ID, Secret, Bot Token)" />
          <StatusRow ok={health.discord_redirect_uri_set} label="DISCORD_REDIRECT_URI ustawiony" />
          <StatusRow ok={health.guild_id_set} label="DISCORD_GUILD_ID ustawiony" />
          <StatusRow ok={health.member_role_set} label="DISCORD_MEMBER_ROLE_ID ustawiony" hint="Bez tego zwykli użytkownicy nie zalogują się przez Discord" />
          <StatusRow ok={health.admin_role_set} label="DISCORD_ADMIN_ROLE_ID ustawiony" hint="Opcjonalne — bez tego nikt nie dostanie roli redaktora automatycznie" />
          <StatusRow ok={health.dev_role_set} label="DISCORD_DEV_ROLE_ID ustawiony" hint="Musi być ustawiony — inaczej nie mógłbyś tu być" />
        </div>
      )}

      {envCheck && (envCheck.deprecated?.length > 0 || envCheck.suspicious?.length > 0) && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700 dark:text-amber-300 space-y-2">
              {envCheck.deprecated?.length > 0 && (
                <p>Przestarzałe zmienne w <code className="font-mono">.env</code> (przeniesione do ustawień w panelu, można usunąć): <code className="font-mono">{envCheck.deprecated.join(', ')}</code></p>
              )}
              {envCheck.suspicious?.map((s, i) => (
                <p key={i}>Podejrzana zmienna <code className="font-mono">{s.found}</code> — czy nie chodziło o <code className="font-mono">{s.suggestion}</code>?</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
