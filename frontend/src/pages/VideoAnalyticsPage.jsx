import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../utils/api';
import { formatDateShort } from '../utils/helpers';

// Dark-mode-only app (index.html hardcodes the `dark` class, no theme toggle exists) — these are
// the dark-surface-validated steps (see the dataviz skill's palette validator), not the light ones.
const COLORS = { retention: '#8b5cf6', pauses: '#d97706', rewinds: '#3b82f6', skips: '#ef4444' };

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

export default function VideoAnalyticsPage() {
  const { id } = useParams();
  const [video, setVideo] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true); setError(null);
    Promise.all([api.getVideo(id), api.getVideoAnalytics(id)])
      .then(([v, a]) => { setVideo(v); setData(a); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-violet-500 animate-spin" /></div>;
  }
  if (error) {
    return <div className="p-10 text-center text-zinc-400 text-sm">{error}</div>;
  }

  const dailyViews = (data?.dailyViews || []).map(d => ({ ...d, dayLabel: formatDateShort(d.day) }));
  const heatmap = data?.heatmap;
  const retentionSeries = heatmap ? heatmap.retention.map((r, i) => ({
    time: formatTime(i * (heatmap.duration / heatmap.buckets)),
    value: r,
  })) : [];

  return (
    <div className="p-6 sm:p-10 max-w-5xl mx-auto page-enter">
      <Link to={`/video/${id}`} className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white font-medium text-sm mb-6 hover:gap-3 transition-all">
        <ArrowLeft className="w-4 h-4" /> Wróć do filmu
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white font-display mb-1">Analityka</h1>
        <p className="text-zinc-500 dark:text-zinc-400">{video?.title}</p>
      </div>

      <div className="space-y-6">
        <ChartCard title="Oglądalność w czasie" subtitle="Liczba wyświetleń dziennie, ostatnie 30 dni">
          {dailyViews.length === 0 ? (
            <p className="text-sm text-zinc-400 py-8 text-center">Brak wyświetleń w tym okresie.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailyViews} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
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
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {!heatmap ? (
          <ChartCard title="Heatmapa odtwarzania">
            <p className="text-sm text-zinc-400 py-4">
              {data?.selfHosted
                ? 'Za mało danych — heatmapa pojawi się, gdy film zbierze więcej odtworzeń.'
                : 'Szczegółowa heatmapa (retencja, cofnięcia, pominięcia, pauzy) jest dostępna tylko dla filmów hostowanych bezpośrednio na platformie — YouTube nie udostępnia tego poziomu szczegółowości.'}
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
    </div>
  );
}
