import React, { useState, useEffect } from 'react';
import { Radio as RadioIcon, Check, X, Loader2 } from 'lucide-react';
import { api } from '../../utils/api';

// STREAM_URL is .env-only and never exposed to the frontend, so this step can't read or write
// it — it can only report whether the streaming service the running container is already
// pointed at is actually reachable, and show the right guide for the chosen topology. The radio
// below is local UI state only (which instructions to show), not something that gets saved.
export default function StreamingStep() {
  const [topology, setTopology] = useState('full');
  const [status, setStatus] = useState(null); // 'loading' | streamVersion object

  useEffect(() => {
    api.getStreamVersion().then(setStatus).catch(() => setStatus({ status: 'offline' }));
  }, []);

  const reachable = status && status.status !== 'offline';

  return (
    <div>
      <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-5">
        <RadioIcon className="w-6 h-6 text-emerald-500" />
      </div>
      <h2 className="text-xl font-bold text-zinc-900 dark:text-white font-display mb-2">Streaming</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-6">
        Self-hosted streaming (upload, transkodowanie, HLS) to osobny serwis komunikujący się z panelem przez{' '}
        <code className="font-mono text-xs">STREAM_URL</code>/<code className="font-mono text-xs">STREAM_SECRET</code> w{' '}
        <code className="font-mono text-xs">.env</code> - to ustawia się przed startem kontenera, więc ten krok tylko
        diagnozuje i pokazuje instrukcję, nic tu nie zapisujesz.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <button
          onClick={() => setTopology('full')}
          className={`text-left p-4 rounded-2xl border-2 transition-colors ${topology === 'full' ? 'border-violet-500 bg-violet-50/50 dark:bg-violet-500/10' : 'border-zinc-200 dark:border-zinc-800'}`}
        >
          <p className="text-sm font-bold text-zinc-900 dark:text-white">Pełna instalacja</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Streaming w tym samym docker-compose, na tym samym serwerze.</p>
        </button>
        <button
          onClick={() => setTopology('standalone')}
          className={`text-left p-4 rounded-2xl border-2 transition-colors ${topology === 'standalone' ? 'border-violet-500 bg-violet-50/50 dark:bg-violet-500/10' : 'border-zinc-200 dark:border-zinc-800'}`}
        >
          <p className="text-sm font-bold text-zinc-900 dark:text-white">Panel + streaming osobno</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Streaming na osobnym serwerze (np. przez Tailscale), panel łączy się przez sieć.</p>
        </button>
      </div>

      <div className={`p-4 rounded-2xl border flex items-center gap-3 mb-6 ${reachable ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20' : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20'}`}>
        {!status ? (
          <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
        ) : reachable ? (
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        ) : (
          <X className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
        )}
        <div className="text-xs">
          {!status ? (
            <span className="text-zinc-400">Sprawdzanie połączenia ze streamerem...</span>
          ) : reachable ? (
            <span className="text-emerald-700 dark:text-emerald-300">
              Streamer osiągalny - wersja {status.version}{status.status === 'deprecated' ? ' (przestarzała, zalecana aktualizacja)' : ''}.
            </span>
          ) : (
            <span className="text-red-700 dark:text-red-300">
              Streamer nieosiągalny pod aktualnie skonfigurowanym <code className="font-mono">STREAM_URL</code>.
            </span>
          )}
        </div>
      </div>

      {(topology === 'standalone' || !reachable) && (
        <div className="p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed space-y-2">
          <p className="font-bold text-zinc-800 dark:text-zinc-200">Jak skonfigurować streaming na osobnym serwerze:</p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li>Sklonuj repo na drugi serwer (albo skopiuj sam folder <code className="font-mono">streaming-standalone/</code>).</li>
            <li><code className="font-mono">cd streaming-standalone && cp .env.example .env</code> - uzupełnij <code className="font-mono">STREAM_SECRET</code> tak samo jak w głównej appce.</li>
            <li><code className="font-mono">docker compose up -d --build</code> na tamtym serwerze.</li>
            <li>Na głównym serwerze ustaw <code className="font-mono">STREAM_URL=http://&lt;adres-drugiego-serwera&gt;:4000</code> w <code className="font-mono">.env</code> i zrestartuj panel.</li>
          </ol>
          <p>Pełne szczegóły: <code className="font-mono">streaming-standalone/README.md</code> w repo.</p>
        </div>
      )}
    </div>
  );
}
