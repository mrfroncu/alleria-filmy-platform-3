import React, { useEffect, useState } from 'react';
import { Database, CheckCircle2, AlertTriangle, Clock, HardDrive, Loader2, Archive } from 'lucide-react';
import { api } from '../utils/api';
import { formatDate } from '../utils/helpers';
import { useToast } from '../contexts/ToastContext';

const pad = (v) => `v${String(v).padStart(3, '0')}`;

function formatBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

// SQLite datetime('now') is UTC without a zone marker — make that explicit before formatting.
const sqliteUtc = (s) => (s && !/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? `${s.replace(' ', 'T')}Z` : s);

const STATUS = {
  ok: { label: 'Aktualna', icon: CheckCircle2, cls: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  behind: { label: 'Oczekujące migracje', icon: Clock, cls: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  ahead: { label: 'Baza nowsza niż aplikacja', icon: AlertTriangle, cls: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400' },
};

// Zarządzanie → Ustawienia → Baza danych: schema version, migration history and backups
// (backend/migrations). Read-only apart from "Utwórz kopię teraz" — migrations only ever run on
// startup, never from the panel.
export default function DatabaseStatusCard() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [backingUp, setBackingUp] = useState(false);

  const load = () => api.getMigrations().then(d => { setData(d); setError(null); }).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const backupNow = async () => {
    setBackingUp(true);
    try {
      const r = await api.createDbBackup();
      toast.success(`Utworzono kopię: ${r.file}`);
      await load();
    } catch (e) {
      toast.error(e.message);
    }
    setBackingUp(false);
  };

  if (error) return <div className="card p-8 text-sm text-red-500">Nie udało się pobrać stanu bazy: {error}</div>;
  if (!data) return <div className="card p-8 flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="w-4 h-4 animate-spin" /> Wczytywanie…</div>;

  const status = STATUS[data.status] || STATUS.ok;
  const StatusIcon = status.icon;

  return (
    <div className="card p-8">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-violet-50 dark:bg-violet-500/10 rounded-2xl flex items-center justify-center shrink-0">
          <Database className="w-6 h-6 text-violet-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display">Wersja schematu {pad(data.currentVersion)}</h3>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${status.cls}`}>
              <StatusIcon className="w-3.5 h-3.5" /> {status.label}
            </span>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Migracje uruchamiają się automatycznie przy starcie aplikacji, każda dokładnie raz. Przed każdą zmianą schematu
            powstaje kopia bazy w <code className="font-mono text-xs">data/backups</code> (przechowywanych jest 5 ostatnich).
            {data.status === 'ahead' && ' Baza ma migracje, których ta wersja aplikacji nie zna — prawdopodobnie aplikacja została cofnięta do starszej wersji.'}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              ['Rozmiar', formatBytes(data.database.sizeBytes)],
              ['Tabele / indeksy', `${data.database.tables} / ${data.database.indexes}`],
              ['SQLite', data.database.sqliteVersion],
              ['Tryb dziennika', String(data.database.journalMode).toUpperCase()],
            ].map(([label, value]) => (
              <div key={label} className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
                <p className="text-sm font-bold text-zinc-900 dark:text-white font-mono">{value}</p>
              </div>
            ))}
          </div>

          {data.pending.length > 0 && (
            <div className="mb-6 p-4 rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/[0.06]">
              <p className="text-sm font-bold text-amber-700 dark:text-amber-300 mb-1">Oczekują na restart aplikacji:</p>
              {data.pending.map(m => (
                <p key={m.version} className="text-xs text-amber-700 dark:text-amber-300"><span className="font-mono font-bold">{pad(m.version)}</span> {m.description || m.name}</p>
              ))}
            </div>
          )}

          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-2 font-display">Historia migracji</p>
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <tbody>
                {data.applied.slice().reverse().map(m => (
                  <tr key={m.version} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 pr-3 font-mono font-bold text-violet-600 dark:text-violet-400 whitespace-nowrap">{pad(m.version)}</td>
                    <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-300">
                      {m.description || m.name}
                      {!m.known && <span className="ml-2 text-[10px] font-bold text-red-500">nieznana tej wersji aplikacji</span>}
                    </td>
                    <td className="py-2 pr-3 text-xs text-zinc-400 font-mono whitespace-nowrap">{formatDate(sqliteUtc(m.applied_at))}</td>
                    <td className="py-2 text-xs text-zinc-400 font-mono whitespace-nowrap text-right">{m.duration_ms != null ? `${m.duration_ms} ms` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Kopie zapasowe</p>
            <button onClick={backupNow} disabled={backingUp} className="btn-ghost flex items-center gap-1.5">
              {backingUp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />} Utwórz kopię teraz
            </button>
          </div>
          {data.backups.length === 0 ? (
            <p className="text-sm text-zinc-400">Brak kopii — pierwsza powstanie przy następnej migracji albo ręcznie.</p>
          ) : (
            <div className="space-y-1.5">
              {data.backups.map(b => (
                <div key={b.file} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 text-xs">
                  <HardDrive className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span className="font-mono text-zinc-700 dark:text-zinc-300 break-all flex-1 min-w-0">{b.file}</span>
                  <span className="text-zinc-400 font-mono">{formatBytes(b.sizeBytes)}</span>
                  <span className="text-zinc-400 font-mono">{formatDate(b.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
