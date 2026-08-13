import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Captions, RotateCcw, Pencil, Check, X } from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../contexts/ToastContext';
import SecurePlayer from '../components/SecurePlayer';

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// One transcript line — timestamp jumps the player above, text becomes an editable textarea on
// click. Segment-level correction, not full-transcript free text, so a typo fix never risks
// clobbering the rest of the transcript.
function SegmentRow({ segment, active, onSeek, onSaved }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(segment.text);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => { if (editing) textareaRef.current?.focus(); }, [editing]);

  const save = async () => {
    const text = draft.trim();
    if (!text || text === segment.text) { setEditing(false); setDraft(segment.text); return; }
    setSaving(true);
    try {
      await api.updateTranscriptSegment(segment.id, text);
      onSaved(segment.id, text);
      setEditing(false);
    } catch (e) { toast.error('Błąd zapisu: ' + e.message); }
    setSaving(false);
  };

  return (
    <div className={`flex gap-3 p-3 rounded-xl transition-colors ${active ? 'bg-violet-50 dark:bg-violet-500/10' : 'hover:bg-zinc-50 dark:hover:bg-white/[0.02]'}`}>
      <button
        onClick={() => onSeek(segment.start_time)}
        className="shrink-0 h-fit px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-violet-600 dark:text-violet-400 text-xs font-mono font-bold hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors"
      >
        {formatTime(segment.start_time)}
      </button>
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="space-y-2">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } if (e.key === 'Escape') { setEditing(false); setDraft(segment.text); } }}
              className="input-field w-full text-sm resize-none"
              rows={2}
            />
            <div className="flex gap-2">
              <button onClick={save} disabled={saving} className="btn-icon-zinc text-emerald-600 disabled:opacity-50"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => { setEditing(false); setDraft(segment.text); }} className="btn-icon-zinc"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ) : (
          <div className="group flex items-start gap-2">
            <p className="text-sm text-zinc-700 dark:text-zinc-200 leading-relaxed flex-1">{segment.text}</p>
            <button onClick={() => setEditing(true)} className="shrink-0 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-violet-500 transition-all" title="Popraw">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {segment.edited === 1 && !editing && <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">poprawione</span>}
      </div>
    </div>
  );
}

export default function VideoTranscriptPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fromAdmin = searchParams.get('from') === 'admin';
  const toast = useToast();
  const [video, setVideo] = useState(null);
  const [data, setData] = useState(null); // { status, language, errorMessage, segments }
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const playerControlRef = useRef(null);

  const load = useCallback(() => {
    Promise.all([api.getVideo(id), api.getTranscript(id)])
      .then(([v, t]) => { setVideo(v); setData(t); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh while a transcription job is in flight, same 30s cadence as the backend's own
  // poll against the streaming service — no point polling faster than the source updates.
  useEffect(() => {
    if (data?.status !== 'pending' && data?.status !== 'processing') return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [data?.status, load]);

  const handleTranscribe = async () => {
    setTriggering(true);
    try {
      await api.transcribeVideo(id);
      toast.success('Transkrypcja uruchomiona.');
      load();
    } catch (e) { toast.error('Błąd: ' + e.message); }
    setTriggering(false);
  };

  const handleSeek = (t) => {
    playerControlRef.current?.seek(t);
    playerControlRef.current?.play?.();
  };

  const handleSegmentSaved = (segId, text) => {
    setData(d => ({ ...d, segments: d.segments.map(s => s.id === segId ? { ...s, text, edited: 1 } : s) }));
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-violet-500 animate-spin" /></div>;
  }
  if (!video) {
    return <div className="p-10 text-center text-zinc-400 text-sm">Nie znaleziono filmu.</div>;
  }

  const activeSegmentId = data?.segments?.slice().reverse().find(s => currentTime >= s.start_time)?.id;

  return (
    <div className="p-6 sm:p-10 max-w-4xl mx-auto page-enter">
      <Link to={fromAdmin ? '/admin' : `/video/${id}`} className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white font-medium text-sm mb-6 hover:gap-3 transition-all">
        <ArrowLeft className="w-4 h-4" /> {fromAdmin ? 'Wróć do panelu redaktora' : 'Wróć do filmu'}
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white font-display mb-1">Transkrypcja</h1>
        <p className="text-zinc-500 dark:text-zinc-400">{video.title}</p>
      </div>

      {video.stream_video_id && video.stream_status === 'ready' && (
        <div className="mb-6 anim-stagger-1">
          <SecurePlayer
            streamVideoId={video.stream_video_id}
            drmEnhanced={video.drm_enhanced}
            title={video.title}
            controlRef={playerControlRef}
            onTimeUpdate={setCurrentTime}
            compactControls
          />
        </div>
      )}

      {(!data || data.status === 'none') && (
        <div className="card p-10 text-center">
          <Captions className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
          <p className="text-sm text-zinc-500 mb-5">Ten film nie ma jeszcze transkrypcji.</p>
          <button onClick={handleTranscribe} disabled={triggering} className="btn-primary disabled:opacity-50">
            {triggering ? 'Uruchamianie...' : 'Transkrybuj film'}
          </button>
        </div>
      )}

      {(data?.status === 'pending' || data?.status === 'processing') && (
        <div className="card p-10 text-center">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin mx-auto mb-4" />
          <p className="text-sm text-zinc-500">
            {data.status === 'pending' ? 'Transkrypcja w kolejce...' : 'Transkrybowanie w toku...'} Strona odświeży się automatycznie.
          </p>
        </div>
      )}

      {data?.status === 'error' && (
        <div className="card p-10 text-center">
          <p className="text-sm text-red-500 font-semibold mb-1">Transkrypcja nie powiodła się</p>
          {data.errorMessage && <p className="text-xs text-zinc-400 mb-5">{data.errorMessage}</p>}
          <button onClick={handleTranscribe} disabled={triggering} className="btn-primary disabled:opacity-50 flex items-center gap-2 mx-auto">
            <RotateCcw className="w-3.5 h-3.5" /> {triggering ? 'Uruchamianie...' : 'Spróbuj ponownie'}
          </button>
        </div>
      )}

      {data?.status === 'ready' && (
        <div className="card p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3 px-2">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-display">
              {data.segments.length} {data.segments.length === 1 ? 'segment' : 'segmentów'}
            </h3>
            {data.language && <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{data.language}</span>}
          </div>
          <div className="space-y-1">
            {data.segments.map(seg => (
              <SegmentRow
                key={seg.id}
                segment={seg}
                active={seg.id === activeSegmentId}
                onSeek={handleSeek}
                onSaved={handleSegmentSaved}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
