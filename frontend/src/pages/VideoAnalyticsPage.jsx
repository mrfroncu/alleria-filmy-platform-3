import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, RotateCcw, Users, TrendingUp, X, ChevronDown } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush } from 'recharts';
import { api } from '../utils/api';
import { formatDateShort } from '../utils/helpers';
import { useConfirm } from '../contexts/ConfirmContext';
import { useToast } from '../contexts/ToastContext';

function Portal({ children }) { return ReactDOM.createPortal(children, document.body); }

// Dark-mode-only app (index.html hardcodes the `dark` class, no theme toggle exists) — these are
// the dark-surface-validated steps (see the dataviz skill's palette validator), not the light ones.
const COLORS = { retention: '#8b5cf6', pauses: '#d97706', rewinds: '#3b82f6', skips: '#ef4444' };

const CONTEXT_OPTIONS = [
  { key: 'all', label: 'Wszystko' },
  { key: 'solo', label: 'Solo' },
  { key: 'watch_party', label: 'Watch Party' },
];

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="card p-6">
      <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-1">{title}</h3>
      {subtitle && <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">{subtitle}</p>}
      {children}
    </div>
  );
}

function StatTile({ label, value, icon: Icon }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-violet-500" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-zinc-900 dark:text-white font-display leading-tight">{value}</p>
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider truncate">{label}</p>
      </div>
    </div>
  );
}

function ViewsTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-[10px] text-zinc-400 font-mono mb-0.5">{label}</p>
      <p className="text-sm font-bold text-white">{payload[0].value} {payload[0].value === 1 ? 'wyświetlenie' : 'wyświetleń'}</p>
    </div>
  );
}

function RetentionTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-[10px] text-zinc-400 font-mono mb-0.5">{label}</p>
      <p className="text-sm font-bold text-white">{Math.round(payload[0].value * 100)}% widzów</p>
    </div>
  );
}

// Hand-built rather than recharts — needs to stay a tight, dense bar strip aligned 1:1 to the
// video's own timeline, not a general-purpose chart. Native `title` tooltip is the per-mark
// hover layer here — a deliberate scope call given these are small multiples, not one chart
// authors will pore over bucket-by-bucket.
function HeatmapStrip({ label, color, values, duration }) {
  const max = Math.max(1, ...values);
  const bucketDuration = duration / values.length;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300">{label}</span>
      </div>
      <div className="flex items-end gap-px h-14 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg p-1.5">
        {values.map((v, i) => (
          <div
            key={i}
            title={`${formatTime(i * bucketDuration)} — ${v}`}
            className="flex-1 rounded-t-sm"
            style={{ height: `${v === 0 ? 3 : Math.max(6, (v / max) * 100)}%`, background: color, opacity: v === 0 ? 0.15 : 0.85 }}
          />
        ))}
      </div>
    </div>
  );
}

const USER_FILTER_MODES = [
  { key: 'all', label: 'Wszyscy' },
  { key: 'include', label: 'Tylko wybrani' },
  { key: 'exclude', label: 'Wszyscy oprócz' },
];

// Include/exclude viewer picker — e.g. a DEV testing playback can exclude themselves so their own
// scrubbing doesn't pollute the real audience's analytics.
function UserFilterControl({ viewers, mode, setMode, selectedIds, setSelectedIds }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const toggle = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const label = mode === 'all'
    ? 'Wszyscy widzowie'
    : mode === 'include'
      ? `Tylko wybrani (${selectedIds.length})`
      : `Wszyscy oprócz (${selectedIds.length})`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="input-field !w-auto !py-1.5 text-xs font-semibold flex items-center gap-2"
      >
        <Users className="w-3.5 h-3.5 text-zinc-400" />
        {label}
        <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
      </button>
      {open && (
        <div className="absolute z-30 mt-2 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl p-3">
          <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg mb-3">
            {USER_FILTER_MODES.map(m => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`flex-1 px-2 py-1 rounded-md text-[11px] font-bold transition-all ${mode === m.key ? 'bg-white dark:bg-zinc-900 text-violet-600 dark:text-violet-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {mode === 'all' ? (
            <p className="text-xs text-zinc-400 px-1 py-2">Uwzględniani są wszyscy widzowie.</p>
          ) : viewers.length === 0 ? (
            <p className="text-xs text-zinc-400 px-1 py-2">Brak widzów do wyboru.</p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {viewers.map(v => (
                <label key={v.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/60 cursor-pointer text-xs">
                  <input type="checkbox" checked={selectedIds.includes(v.id)} onChange={() => toggle(v.id)} className="accent-violet-500" />
                  <span className="truncate text-zinc-700 dark:text-zinc-200">{v.display_name || v.username}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function describeUserFilter(mode, selectedIds, viewers) {
  if (mode === 'all' || selectedIds.length === 0) return 'wszystkich widzów';
  const names = selectedIds.map(id => viewers.find(v => v.id === id)).filter(Boolean).map(v => v.display_name || v.username);
  const list = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} i ${names.length - 3} innych`;
  return mode === 'include' ? `tylko: ${list}` : `wszystkich oprócz: ${list}`;
}

// Reset modal deletes exactly what the page's own filters (context + drag-selected date range +
// user filter) currently show — no separate range/user picker to keep in sync with the charts.
function ResetModal({ videoId, context, activeRange, userFilterMode, selectedUserIds, viewers, onClose, onDone }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const rangeActive = !!(activeRange.after || activeRange.before);
  const scoped = rangeActive || userFilterMode !== 'all' || context !== 'all';

  const handleSubmit = async () => {
    const msg = scoped
      ? 'Usunąć dane analityczne dla aktualnie zastosowanych filtrów? Tej operacji nie można cofnąć.'
      : 'Usunąć WSZYSTKIE dane analityczne tego filmu (cały wykres oglądalności i heatmapa)? Tej operacji nie można cofnąć.';
    if (!(await confirm(msg, { danger: true, confirmLabel: 'Usuń dane' }))) return;
    setBusy(true);
    try {
      const r = await api.resetVideoAnalytics(videoId, {
        after: activeRange.after || undefined,
        before: activeRange.before || undefined,
        userIds: userFilterMode === 'include' ? selectedUserIds : undefined,
        excludeUserIds: userFilterMode === 'exclude' ? selectedUserIds : undefined,
      });
      toast.success(`Usunięto ${r.deletedEvents} zdarzeń i ${r.deletedViews} wyświetleń.`);
      onDone();
    } catch (e) { toast.error('Błąd: ' + e.message); }
    setBusy(false);
  };

  return (
    <Portal>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }} onClick={onClose} />
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[32px] shadow-2xl max-w-md w-full p-8" style={{ position: 'relative', zIndex: 1 }}>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display">Resetuj dane analityczne</h3>
            <button onClick={onClose} className="btn-icon-zinc"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">
            Usuwane są dokładnie te dane, które widać teraz na wykresach — zamknij to okno i zmień filtry/zakres na stronie, jeśli chcesz usunąć inny zestaw. Nie dotyka zapamiętanej pozycji "Kontynuuj oglądanie".
          </p>
          <div className="space-y-2 mb-4 text-xs bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl p-4">
            <div className="flex justify-between gap-3">
              <span className="text-zinc-400">Kontekst</span>
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">{CONTEXT_OPTIONS.find(o => o.key === context)?.label}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-zinc-400">Zakres dat</span>
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">{rangeActive ? `${activeRange.after || '...'} – ${(activeRange.before || '').split(' ')[0] || '...'}` : 'cała historia'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-zinc-400 shrink-0">Widzowie</span>
              <span className="font-semibold text-zinc-700 dark:text-zinc-200 text-right">{describeUserFilter(userFilterMode, selectedUserIds, viewers)}</span>
            </div>
          </div>
          {!scoped && (
            <p className="text-xs text-red-500 dark:text-red-400 font-semibold mb-4">Brak aktywnych filtrów — to usunie wszystkie dane tego filmu.</p>
          )}
          <div className="flex gap-3 mt-2">
            <button onClick={onClose} className="btn-ghost text-sm flex-1">Anuluj</button>
            <button onClick={handleSubmit} disabled={busy} className="btn-sm-danger text-sm flex-1 disabled:opacity-50">
              {busy ? 'Usuwanie...' : 'Usuń dane'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export default function VideoAnalyticsPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fromAdmin = searchParams.get('from') === 'admin';
  const [video, setVideo] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [context, setContext] = useState('all');
  const [userFilterMode, setUserFilterMode] = useState('all');
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [showReset, setShowReset] = useState(false);
  // Drag-selected date window from the views chart's <Brush> — null/null = full history. Feeds
  // every other chart (heatmap/retention share the same fetch) and the reset modal, Grafana-style.
  const [activeRange, setActiveRange] = useState({ after: null, before: null });
  const [pendingRange, setPendingRange] = useState(null);

  useEffect(() => { api.getVideo(id).then(setVideo).catch(() => {}); }, [id]);

  // Debounce the brush→fetch commit so a drag-in-progress doesn't fire a request per pixel; it
  // settles ~400ms after the last onChange, which in practice means right after mouseup.
  useEffect(() => {
    if (!pendingRange) return;
    const t = setTimeout(() => setActiveRange(pendingRange), 400);
    return () => clearTimeout(t);
  }, [pendingRange]);

  const loadAnalytics = useCallback(() => {
    setLoading(true); setError(null);
    api.getVideoAnalytics(id, {
      context,
      userIds: userFilterMode === 'include' ? selectedUserIds : undefined,
      excludeUserIds: userFilterMode === 'exclude' ? selectedUserIds : undefined,
      after: activeRange.after || undefined,
      before: activeRange.before || undefined,
    })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, context, userFilterMode, selectedUserIds, activeRange]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  const rangeActive = !!(activeRange.after || activeRange.before);
  const resetRange = () => { setPendingRange(null); setActiveRange({ after: null, before: null }); };

  if (loading && !data) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-violet-500 animate-spin" /></div>;
  }
  if (error) {
    return <div className="p-10 text-center text-zinc-400 text-sm">{error}</div>;
  }

  const dailyViews = (data?.dailyViews || []).map(d => ({ ...d, dayLabel: formatDateShort(d.day) }));
  const heatmap = data?.heatmap;
  const viewers = data?.viewers || [];
  const retentionSeries = heatmap ? heatmap.retention.map((r, i) => ({
    time: formatTime(i * (heatmap.duration / heatmap.buckets)),
    value: r,
  })) : [];

  return (
    <div className="p-6 sm:p-10 max-w-5xl mx-auto page-enter">
      <Link to={fromAdmin ? '/admin' : `/video/${id}`} className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white font-medium text-sm mb-6 hover:gap-3 transition-all">
        <ArrowLeft className="w-4 h-4" /> {fromAdmin ? 'Wróć do panelu redaktora' : 'Wróć do filmu'}
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white font-display mb-1">Analityka</h1>
        <p className="text-zinc-500 dark:text-zinc-400">{video?.title}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl">
          {CONTEXT_OPTIONS.map(o => (
            <button
              key={o.key}
              onClick={() => setContext(o.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${context === o.key ? 'bg-white dark:bg-zinc-900 text-violet-600 dark:text-violet-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <UserFilterControl
          viewers={viewers}
          mode={userFilterMode}
          setMode={setUserFilterMode}
          selectedIds={selectedUserIds}
          setSelectedIds={setSelectedUserIds}
        />
        {rangeActive && (
          <button
            onClick={resetRange}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-500/10 hover:bg-violet-100 dark:hover:bg-violet-500/20 text-violet-600 dark:text-violet-400 text-xs font-bold transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Resetuj zakres
          </button>
        )}
        <button
          onClick={() => setShowReset(true)}
          className="btn-link-red flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-zinc-400 text-xs font-bold ml-auto"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Resetuj dane
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatTile label="Unikalni widzowie" value={loading ? '—' : (data?.summary?.uniqueViewers ?? 0)} icon={Users} />
        <StatTile
          label="Śr. ukończenie"
          value={loading ? '—' : (data?.summary?.avgCompletionPct != null ? `${data.summary.avgCompletionPct}%` : '—')}
          icon={TrendingUp}
        />
      </div>

      <div className="space-y-6" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
        <ChartCard
          title="Oglądalność w czasie"
          subtitle={
            dailyViews.length > 1
              ? (rangeActive ? 'Zawężono zakres — przeciągnij pasek ponownie lub kliknij „Resetuj zakres"' : 'Liczba wyświetleń dziennie, cała historia — przeciągnij pasek pod wykresem, by zawęzić zakres (dotyczy też pozostałych wykresów poniżej)')
              : 'Liczba wyświetleń dziennie'
          }
        >
          {dailyViews.length === 0 ? (
            <p className="text-sm text-zinc-400 py-8 text-center">Brak wyświetleń w tym okresie.</p>
          ) : (
            <ResponsiveContainer width="100%" height={dailyViews.length > 1 ? 260 : 220}>
              <AreaChart key={`${activeRange.after || ''}-${activeRange.before || ''}-${dailyViews.length}`} data={dailyViews} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.retention} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={COLORS.retention} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="dayLabel" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                <Tooltip content={<ViewsTooltip />} cursor={{ stroke: '#3f3f46', strokeWidth: 1 }} />
                <Area type="monotone" dataKey="views" stroke={COLORS.retention} strokeWidth={2} fill="url(#viewsFill)" />
                {dailyViews.length > 1 && (
                  <Brush
                    dataKey="dayLabel"
                    height={28}
                    travellerWidth={8}
                    stroke="#8b5cf6"
                    fill="#18181b"
                    onChange={(range) => {
                      if (range?.startIndex == null || range?.endIndex == null) return;
                      if (range.startIndex === 0 && range.endIndex === dailyViews.length - 1) { setPendingRange(null); return; }
                      const startDay = dailyViews[range.startIndex]?.day;
                      const endDay = dailyViews[range.endIndex]?.day;
                      if (!startDay || !endDay) return;
                      setPendingRange({ after: startDay, before: `${endDay} 23:59:59` });
                    }}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {!heatmap ? (
          <ChartCard title="Heatmapa odtwarzania">
            <p className="text-sm text-zinc-400 py-4">
              Za mało danych — heatmapa (retencja, cofnięcia, pominięcia, pauzy) pojawi się, gdy film zbierze więcej odtworzeń z zarejestrowanymi zdarzeniami odtwarzacza.
            </p>
          </ChartCard>
        ) : (
          <>
            <ChartCard title="Retencja" subtitle={`Odsetek widzów, którzy dotarli do danego momentu (${heatmap.viewers} widzów)`}>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={retentionSeries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="retentionFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.retention} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={COLORS.retention} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="time" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} minTickGap={40} />
                  <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} domain={[0, 1]} tickFormatter={v => `${Math.round(v * 100)}%`} width={36} />
                  <Tooltip content={<RetentionTooltip />} cursor={{ stroke: '#3f3f46', strokeWidth: 1 }} />
                  <Area type="monotone" dataKey="value" stroke={COLORS.retention} strokeWidth={2} fill="url(#retentionFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Interakcje widzów" subtitle="Gdzie widzowie pauzują, cofają się i pomijają fragmenty">
              <div className="space-y-5">
                <HeatmapStrip label="Pauzy" color={COLORS.pauses} values={heatmap.pauses} duration={heatmap.duration} />
                <HeatmapStrip label="Cofnięcia (ponowne obejrzenie)" color={COLORS.rewinds} values={heatmap.rewinds} duration={heatmap.duration} />
                <HeatmapStrip label="Pominięcia (skip)" color={COLORS.skips} values={heatmap.skips} duration={heatmap.duration} />
              </div>
            </ChartCard>
          </>
        )}
      </div>

      {showReset && (
        <ResetModal
          videoId={id}
          context={context}
          activeRange={activeRange}
          userFilterMode={userFilterMode}
          selectedUserIds={selectedUserIds}
          viewers={viewers}
          onClose={() => setShowReset(false)}
          onDone={() => { setShowReset(false); loadAnalytics(); }}
        />
      )}
    </div>
  );
}
