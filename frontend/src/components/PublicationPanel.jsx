import React, { useState, useEffect, useCallback } from 'react';
import { X, Loader2, RefreshCw, Send } from 'lucide-react';
import { api } from '../utils/api';
import { formatDate } from '../utils/helpers';
import { useConfirm } from '../contexts/ConfirmContext';
import { useToast } from '../contexts/ToastContext';

// Publication lifecycle + "new video" announcement log for one video (admin/dev only):
// current state, why the automatic announcement hasn't happened yet, per-channel category
// config with the last delivery result, manual resend, full delivery history and audit trail.

// SQLite datetime('now') values are UTC without a zone marker ("YYYY-MM-DD HH:MM:SS") —
// new Date() would read them as local time, so mark them UTC first.
const dbDate = (s) => (s && !/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? `${s.replace(' ', 'T')}Z` : s);

const CHANNELS = [
  { key: 'webhook', label: 'Webhook Discord' },
  { key: 'email', label: 'E-mail' },
  { key: 'push', label: 'Push w przeglądarce' },
  { key: 'bell', label: 'Powiadomienie w aplikacji' },
];
const CHANNEL_LABEL = Object.fromEntries(CHANNELS.map(c => [c.key, c.label]));

const STATUS = {
  sent: { label: 'Wysłano', cls: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  partial: { label: 'Częściowo', cls: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  failed: { label: 'Błąd', cls: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400' },
  skipped: { label: 'Pominięto', cls: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500' },
};

const STATE = {
  published: { label: 'Opublikowany', cls: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  scheduled: { label: 'Zaplanowany', cls: 'bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-300' },
  hidden: { label: 'Ukryty', cls: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400' },
};

function StatusChip({ status }) {
  const s = STATUS[status] || STATUS.skipped;
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}

function channelConfig(key, data) {
  const ch = data.channels[key];
  if (key === 'bell') return { text: 'Zawsze włączone', ok: true };
  if (!data.video.category_id) return { text: 'Film bez kategorii', ok: false };
  if (key === 'webhook') {
    if (!ch.configured) return { text: 'Brak adresu webhooka w kategorii', ok: false };
    if (!ch.enabled) return { text: 'Wyłączony w kategorii', ok: false };
    return { text: `Włączony (${ch.host})`, ok: true };
  }
  if (!ch.enabled) return { text: 'Wyłączone w kategorii', ok: false };
  if (key === 'email' && !ch.smtp_configured) return { text: 'Włączone, ale SMTP nie jest skonfigurowany', ok: false };
  return { text: 'Włączone', ok: true };
}

function pendingText(data) {
  const { pending, video } = data;
  if (pending === 'hidden') return 'Film jest ukryty. Powiadomienia wyślą się automatycznie po ręcznej publikacji.';
  if (pending === 'scheduled') return `Powiadomienia wyślą się automatycznie w momencie publikacji: ${formatDate(video.publish_date)}.`;
  if (pending === 'transcoding') return 'Powiadomienia wyślą się automatycznie po zakończeniu transkodowania.';
  if (pending === 'stream_error') return 'Transkodowanie zakończyło się błędem. Powiadomienia nie wyjdą, dopóki film nie będzie gotowy.';
  if (pending === 'due') return 'Film jest opublikowany. Powiadomienia wyślą się automatycznie w ciągu minuty.';
  return null;
}

const RESEND_BLOCKED = {
  hidden: 'Film jest ukryty - najpierw go opublikuj.',
  scheduled: 'Film jest zaplanowany - powiadomienia wyślą się same w momencie publikacji.',
  transcoding: 'Film jest jeszcze transkodowany.',
  stream_error: 'Transkodowanie zakończyło się błędem.',
  not_announced: 'Automatyczna wysyłka jeszcze się nie odbyła.',
};

const byWho = (l) => (l.trigger === 'manual' ? `ręcznie: ${l.user_display_name || l.user_name || '?'}` : 'automatycznie');

export default function PublicationPanel({ videoId, isOpen, onClose }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.getVideoPublication(videoId));
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    if (!isOpen) return;
    setData(null); setSelected([]);
    load();
  }, [isOpen, load]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && isOpen) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggle = (key) => setSelected(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));

  const resend = async () => {
    const names = selected.map(k => CHANNEL_LABEL[k]).join(', ');
    if (!(await confirm(`Wysłać ponownie powiadomienia o „${data.video.title}"? Kanały: ${names}. Odbiorcy dostaną je jeszcze raz.`, { confirmLabel: 'Wyślij' }))) return;
    setSending(true);
    try {
      const res = await api.resendVideoNotifications(videoId, selected);
      const failed = res.results.filter(r => r.status === 'failed' || r.status === 'partial');
      if (failed.length) toast.error(`Nie wszystko doszło: ${failed.map(r => CHANNEL_LABEL[r.channel]).join(', ')}`);
      else toast.success('Powiadomienia wysłane.');
      setSelected([]);
      await load();
    } catch (e) {
      toast.error('Błąd: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  const firstAuto = data ? [...data.log].reverse().find(l => l.trigger === 'auto') : null;
  const lastFor = (key) => data?.log.find(l => l.channel === key);

  return (
    <div className="modal-overlay">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-content max-w-3xl" style={{ animation: 'slideUp 0.3s ease-out' }}>
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Publikacja i powiadomienia</h2>
              {data && <p className="text-sm text-zinc-500 truncate">{data.video.title}</p>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={load} disabled={loading} className="btn-icon-zinc" title="Odśwież">
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={onClose} className="btn-icon-zinc"><X className="w-6 h-6" /></button>
            </div>
          </div>

          {error && <div className="p-3 bg-red-50 dark:bg-red-500/10 rounded-xl text-sm text-red-600 dark:text-red-400">{error}</div>}
          {!data && !error && <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>}

          {data && (
            <div className="space-y-6">
              {/* Status */}
              <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`font-bold px-2.5 py-1 rounded-lg ${STATE[data.state].cls}`}>{STATE[data.state].label}</span>
                  <span className="text-zinc-500">Data publikacji: <span className="font-mono">{formatDate(data.video.publish_date)}</span></span>
                  {data.video.category_name && <span className="text-zinc-500">· Kategoria: {data.video.category_name}</span>}
                  {data.video.stream_status && data.video.stream_status !== 'ready' && (
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">· Stream: {data.video.stream_status}</span>
                  )}
                </div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  {data.video.announced
                    ? (firstAuto
                      ? `Film został ogłoszony ${formatDate(dbDate(firstAuto.created_at))}.`
                      : 'Film został ogłoszony (zanim pojawił się dziennik wysyłek, więc szczegóły nie są znane).')
                    : pendingText(data)}
                </p>
              </section>

              {/* Channels */}
              <section>
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-2 font-display">Kanały</h3>
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {CHANNELS.map(({ key, label }) => {
                    const cfg = channelConfig(key, data);
                    const last = lastFor(key);
                    return (
                      <label key={key} className={`flex items-start gap-3 px-4 py-3 ${data.resend_blocked ? '' : 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/[0.02]'}`}>
                        <input
                          type="checkbox"
                          checked={selected.includes(key)}
                          onChange={() => toggle(key)}
                          disabled={!!data.resend_blocked || !cfg.ok}
                          className="mt-0.5 w-4 h-4 rounded border-zinc-300 text-violet-500 focus:ring-violet-500 disabled:opacity-40"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-zinc-900 dark:text-white">{label}</span>
                            <span className={`text-[11px] ${cfg.ok ? 'text-zinc-500' : 'text-amber-600 dark:text-amber-400'}`}>{cfg.text}</span>
                          </div>
                          {last ? (
                            <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-zinc-500">
                              <StatusChip status={last.status} />
                              <span className="font-mono">{formatDate(dbDate(last.created_at))}</span>
                              <span>({byWho(last)})</span>
                              {last.detail && <span className="text-zinc-600 dark:text-zinc-400 break-all">{last.detail}</span>}
                            </div>
                          ) : (
                            <p className="mt-1 text-[11px] text-zinc-400">Jeszcze nie wysyłano.</p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  <button onClick={resend} disabled={!!data.resend_blocked || selected.length === 0 || sending} className="btn-sm-primary flex items-center gap-2">
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Wyślij ponownie{selected.length ? ` (${selected.length})` : ''}
                  </button>
                  <span className="text-xs text-zinc-500">
                    {data.resend_blocked ? RESEND_BLOCKED[data.resend_blocked] : 'Zaznacz kanały, które mają zostać wysłane jeszcze raz.'}
                  </span>
                </div>
              </section>

              {/* Delivery history */}
              <section>
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-2 font-display">Historia wysyłek ({data.log.length})</h3>
                {data.log.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">Brak wpisów.</p>
                ) : (
                  <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 max-h-64 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60">
                    {data.log.map(l => (
                      <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs">
                        <span className="font-mono text-zinc-400 whitespace-nowrap">{formatDate(dbDate(l.created_at))}</span>
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">{CHANNEL_LABEL[l.channel] || l.channel}</span>
                        <StatusChip status={l.status} />
                        <span className="text-zinc-500">{byWho(l)}</span>
                        {l.detail && <span className="text-zinc-600 dark:text-zinc-400 break-all basis-full sm:basis-auto">{l.detail}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Audit trail */}
              <section>
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-2 font-display">Historia zmian filmu</h3>
                {data.audit.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">Brak wpisów.</p>
                ) : (
                  <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 max-h-48 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60">
                    {data.audit.map(a => (
                      <div key={a.id} className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-2 text-xs">
                        <span className="font-mono text-zinc-400 whitespace-nowrap">{formatDate(dbDate(a.created_at))}</span>
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">{a.user_display_name || a.user_name || 'system'}</span>
                        <span className="text-zinc-500 break-all">{a.details}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
