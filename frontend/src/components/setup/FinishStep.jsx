import React, { useState, useEffect } from 'react';
import { PartyPopper } from 'lucide-react';
import { api } from '../../utils/api';
import { StatusRow } from './SetupUI';

export default function FinishStep({ settings }) {
  const [health, setHealth] = useState(null);
  const [streamStatus, setStreamStatus] = useState(null);

  useEffect(() => {
    api.getHealth().then(setHealth).catch(() => {});
    api.getStreamVersion().then(setStreamStatus).catch(() => setStreamStatus({ status: 'offline' }));
  }, []);

  const smtpConfigured = !!settings?.smtp_host;
  const tsConfigured = !!(settings?.ts6_host || settings?.ts3_host);

  return (
    <div>
      <div className="w-12 h-12 rounded-2xl bg-fuchsia-50 dark:bg-fuchsia-500/10 flex items-center justify-center mb-5">
        <PartyPopper className="w-6 h-6 text-fuchsia-500" />
      </div>
      <h2 className="text-xl font-bold text-zinc-900 dark:text-white font-display mb-2">Podsumowanie</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-6">
        Szybki przegląd stanu instalacji. Kliknij „Zakończ konfigurację” poniżej, żeby ten kreator przestał się
        automatycznie pojawiać - wszystkie ustawienia i tak zawsze zostają dostępne w Zarządzanie → Ustawienia.
      </p>

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        <StatusRow ok={!!health?.discord_configured} label="Discord OAuth" hint={health?.discord_configured ? 'Skonfigurowany' : 'Brakuje danych w .env'} />
        <StatusRow ok={tsConfigured} label="TeamSpeak" hint={tsConfigured ? 'Skonfigurowany' : 'Nieskonfigurowany (opcjonalne)'} />
        <StatusRow ok={streamStatus && streamStatus.status !== 'offline'} label="Streaming" hint={streamStatus?.status === 'offline' ? 'Nieosiągalny' : `Osiągalny${streamStatus?.version ? ` - v${streamStatus.version}` : ''}`} />
        <StatusRow ok={smtpConfigured} label="E-mail (SMTP)" hint={smtpConfigured ? 'Skonfigurowany' : 'Nieskonfigurowany (opcjonalne)'} />
      </div>
    </div>
  );
}
