import React, { useState, useEffect } from 'react';
import { Sparkles, Database } from 'lucide-react';
import { api } from '../../utils/api';

export default function WelcomeStep({ onFinish }) {
  const [stats, setStats] = useState(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => { api.getStats().then(setStats).catch(() => {}); }, []);

  const isExistingInstall = !!stats && (stats.totalUsers > 1 || stats.totalVideos > 0);

  const finishNow = async () => {
    setFinishing(true);
    try { await onFinish(); } finally { setFinishing(false); }
  };

  return (
    <div>
      <div className="w-12 h-12 rounded-2xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center mb-5">
        <Sparkles className="w-6 h-6 text-violet-500" />
      </div>
      <h2 className="text-xl font-bold text-zinc-900 dark:text-white font-display mb-2">Witaj w konfiguracji Alleria Filmy</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-6">
        Ten kreator przeprowadzi Cię przez sprawdzenie konfiguracji <code className="font-mono text-xs">.env</code>,
        wybór topologii wdrożenia (osobny serwer streamingu czy nie) oraz wszystkie ustawienia, które normalnie
        znajdziesz w Zarządzanie → Ustawienia. Widzisz go, bo jesteś zalogowany jako <code className="font-mono text-xs">dev</code>,
        a instalacja nie została jeszcze oznaczona jako skonfigurowana — po zakończeniu kreator nie będzie się już pojawiał automatycznie.
      </p>

      {stats && (
        <div className={`p-4 rounded-2xl border flex items-start gap-3 ${isExistingInstall ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20' : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'}`}>
          <Database className={`w-4 h-4 shrink-0 mt-0.5 ${isExistingInstall ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400'}`} />
          <div className="flex-1">
            {isExistingInstall ? (
              <>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Wygląda na już skonfigurowaną instalację</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                  Znaleziono {stats.totalUsers} użytkowników i {stats.totalVideos} filmów w bazie. Kolejne kroki będą już
                  wypełnione aktualnymi wartościami — możesz się po prostu przeklikać, albo od razu zakończyć.
                </p>
                <button onClick={finishNow} disabled={finishing} className="btn-secondary text-xs mt-3 disabled:opacity-50">
                  {finishing ? 'Zapisywanie...' : 'Zakończ teraz, wszystko wygląda dobrze'}
                </button>
              </>
            ) : (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Baza wygląda na świeżą — zero filmów, tylko Twoje konto. Przejdźmy przez konfigurację krok po kroku.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
