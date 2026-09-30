import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Database, Upload, Loader2 } from 'lucide-react';
import { api } from '../../utils/api';
import { importDatabaseFile, describeImport, reloadAfterImport } from '../../utils/dbImport';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useSettings } from '../../contexts/SettingsContext';

export default function WelcomeStep({ onFinish }) {
  const confirm = useConfirm();
  const { config } = useSettings();
  const [stats, setStats] = useState(null);
  const [finishing, setFinishing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [importProgress, setImportProgress] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => { api.getStats().then(setStats).catch(() => {}); }, []);

  const isExistingInstall = !!stats && (stats.totalUsers > 1 || stats.totalVideos > 0);

  const finishNow = async () => {
    setFinishing(true);
    try { await onFinish(); } finally { setFinishing(false); }
  };

  // Restoring an export brings its app_settings along (setup_status included), so a restored
  // install normally skips the rest of the wizard — the reload lands on / (or /login).
  const handleRestore = async (e) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    const warn = isExistingInstall ? ' Ta instalacja ma już dane - zostaną zastąpione (kopia trafi do data/backups/).' : '';
    if (!(await confirm(`Przywrócić bazę z pliku "${file.name}"?${warn}`, { danger: isExistingInstall, confirmLabel: 'Przywróć' }))) return;
    setImporting(true);
    setImportError(null);
    try {
      const result = await importDatabaseFile(file, { chunked: config.chunkedUpload, onProgress: setImportProgress });
      await confirm(`Przywrócono: ${describeImport(result)}. Pamiętaj o skopiowaniu katalogu data/uploads/ (miniatury, awatary) ze starego serwera.${result.relogin ? ' Zaloguj się ponownie.' : ''}`, { title: 'Baza przywrócona', confirmLabel: 'Dalej', cancelLabel: 'Zamknij' });
      reloadAfterImport(result);
    } catch (err) {
      setImportError(err.message);
      setImporting(false);
    }
  };

  return (
    <div>
      <div className="w-12 h-12 rounded-2xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center mb-5">
        <Sparkles className="w-6 h-6 text-violet-500" />
      </div>
      <h2 className="text-xl font-bold text-zinc-900 dark:text-white font-display mb-2">Witaj w konfiguracji Alleria Filmy</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-6">
        Ten kreator przeprowadzi Cię przez konfigurację <code className="font-mono text-xs">.env</code>, wybór topologii
        wdrożenia oraz wszystkie ustawienia w panelu. Widzisz go, bo jesteś zalogowany jako{' '}
        <code className="font-mono text-xs">dev</code>, a instalacja nie została jeszcze oznaczona jako skonfigurowana -
        po zakończeniu kreator nie będzie się już pojawiał automatycznie.
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
                  wypełnione aktualnymi wartościami - możesz się po prostu przeklikać, albo od razu zakończyć.
                </p>
                <button onClick={finishNow} disabled={finishing} className="btn-secondary text-xs mt-3 disabled:opacity-50">
                  {finishing ? 'Zapisywanie...' : 'Zakończ teraz, wszystko wygląda dobrze'}
                </button>
              </>
            ) : (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Baza wygląda na świeżą - zero filmów, tylko Twoje konto. Przejdźmy przez konfigurację krok po kroku.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 p-4 rounded-2xl border bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 flex items-start gap-3">
        <Upload className="w-4 h-4 shrink-0 mt-0.5 text-zinc-400" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Przenosisz platformę z innego serwera?</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
            Wgraj plik z Dev Tools → Debug → „Eksportuj JSON” ze starej instalacji - przywróci użytkowników, filmy, kategorie,
            rangi, statystyki i wszystkie ustawienia panelu. Pliki z <code className="font-mono">data/uploads/</code> (miniatury, awatary)
            oraz <code className="font-mono">.env</code> trzeba skopiować osobno.
          </p>
          <label className={`btn-secondary text-xs mt-3 inline-flex items-center gap-1.5 ${importing ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {importing ? (importProgress || 'Przywracanie...') : 'Przywróć z pliku JSON'}
            <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleRestore} className="hidden" />
          </label>
          {importError && <p className="text-xs text-red-600 dark:text-red-400 mt-2">Błąd: {importError}</p>}
        </div>
      </div>
    </div>
  );
}
