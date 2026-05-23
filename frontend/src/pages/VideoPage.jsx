import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowLeft, Heart, Pencil, MessageCircle, Send, Trash2, Reply, Check, X, AlertTriangle, Play } from 'lucide-react';
import { api } from '../utils/api';
import { formatDate, youtubeToEmbed, extractYoutubeId } from '../utils/helpers';
import { useAuth } from '../contexts/AuthContext';
import SecurePlayer from '../components/SecurePlayer';
import VideoModal from '../components/VideoModal';

function Portal({ children }) { return ReactDOM.createPortal(children, document.body); }

function HtmlEmbed({ html }) {
  const [blobUrl, setBlobUrl] = useState(null);
  useEffect(() => {
    if (!html) return;
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center}</style></head><body>${html}</body></html>`;
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [html]);
  if (!blobUrl) return null;
  return <iframe src={blobUrl} className="w-full h-full border-0" sandbox="allow-forms" allowFullScreen />;
}

function loadYtApi() {
  return new Promise(resolve => {
    if (window.YT?.Player) return resolve();
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
    const iv = setInterval(() => { if (window.YT?.Player) { clearInterval(iv); resolve(); } }, 50);
  });
}

function YouTubeTrackingPlayer({ videoId, onTimeUpdate, controlRef }) {
  const wrapperRef = useRef(null);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !videoId) return;
    let destroyed = false, player = null, pollId = null;
    const reportTime = () => { if (!player) return; const ct = player.getCurrentTime?.() ?? 0; const dur = player.getDuration?.() ?? 0; if (dur > 0 && onTimeUpdateRef.current) onTimeUpdateRef.current(ct, dur); };
    const stopPoll = () => { if (pollId) { clearInterval(pollId); pollId = null; } };
    const startPoll = () => { stopPoll(); reportTime(); pollId = setInterval(reportTime, 2000); };
    const playerDiv = document.createElement('div');
    playerDiv.style.width = '100%';
    playerDiv.style.height = '100%';
    wrapper.appendChild(playerDiv);
    loadYtApi().then(() => {
      if (destroyed) return;
      player = new window.YT.Player(playerDiv, {
        videoId,
        playerVars: { autoplay: 0, controls: 1, rel: 0, origin: window.location.origin },
        events: {
          onReady: () => { if (controlRef) controlRef.current = { seek: (pos) => player.seekTo(pos, true) }; },
          onStateChange: ({ data }) => { if (data === window.YT.PlayerState.PLAYING) startPoll(); else stopPoll(); },
        },
      });
    });
    return () => { destroyed = true; stopPoll(); try { player?.destroy(); } catch (_) {} try { if (wrapper.firstChild) wrapper.innerHTML = ''; } catch (_) {} };
  }, [videoId]);
  return <div ref={wrapperRef} className="w-full h-full" />;
}

// ── Comment node ────────────────────────────────────────────────────────────
function CommentNode({ c, depth, replies, user, editingId, editContent, setEditContent, silentEdit, setSilentEdit, onStartEdit, onSaveEdit, onCancelEdit, onReply, onDelete, onHardDelete, editHistoryId, setEditHistoryId }) {
  const isEditing = editingId === c.id;
  const isDev = user?.role === 'dev';
  const canMod = c.user_id === user?.id || user?.role === 'admin' || isDev;
  const isDeleted = c.deleted === 1;
  let history = []; try { history = JSON.parse(c.edit_history || '[]'); } catch (e) {}

  return (
    <div className={depth > 0 ? 'ml-6 sm:ml-10 pl-4' : ''}
      style={depth > 0 ? { borderLeft: '2px solid rgba(255,91,46,0.18)' } : {}}>
      <div className="flex gap-3 group py-2.5 -mx-2 px-2 rounded-xl transition-all"
        style={{ background: '' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(246,246,250,0.03)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
        <img
          src={c.avatar || `https://ui-avatars.com/api/?name=${c.display_name || c.username || 'U'}&background=ff5b2e&color=fff&size=80`}
          alt=""
          className={`w-8 h-8 rounded-xl shrink-0 object-cover mt-0.5 ${isDeleted ? 'opacity-30 grayscale' : ''}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className={`text-sm font-bold ${isDeleted ? '' : ''}`}
              style={{ color: isDeleted ? 'var(--fg-4)' : 'var(--fg)' }}>
              {c.display_name || c.username}
            </span>
            <span className="text-[10px] font-mono" style={{ color: 'var(--fg-4)' }}>{formatDate(c.created_at)}</span>
            {c.edited === 1 && !isDeleted && (
              <button onClick={() => setEditHistoryId(editHistoryId === c.id ? null : c.id)}
                className="text-[9px] font-mono transition-colors"
                style={{ color: 'var(--fg-4)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--ember)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-4)'; }}>
                (edytowano)
              </button>
            )}
          </div>

          {isDeleted
            ? <p className="text-sm italic" style={{ color: 'var(--fg-4)' }}>(komentarz usunięty)</p>
            : isEditing ? (
              <div className="space-y-2" onClick={e => e.stopPropagation()}>
                <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                  className="glass-input !py-2 !px-3 text-sm resize-none w-full" rows={2} autoFocus />
                <div className="flex items-center gap-2">
                  <button onClick={() => onSaveEdit(c.id)}
                    className="p-1.5 rounded-lg transition-all hover:scale-110"
                    style={{ color: 'var(--ok)', background: 'rgba(101,232,146,0.08)' }}>
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={onCancelEdit}
                    className="p-1.5 rounded-lg transition-all hover:scale-110"
                    style={{ color: 'var(--fg-3)', background: 'rgba(246,246,250,0.05)' }}>
                    <X className="w-4 h-4" />
                  </button>
                  {isDev && (
                    <label className="flex items-center gap-1.5 text-[10px] cursor-pointer ml-2 select-none" style={{ color: 'var(--warn)' }}>
                      <input type="checkbox" checked={silentEdit} onChange={e => setSilentEdit(e.target.checked)} className="w-3 h-3 rounded" />
                      Ciche
                    </label>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--fg-3)' }}>
                {c.content}
              </p>
            )
          }

          {editHistoryId === c.id && history.length > 0 && (
            <div className="mt-2 p-3 rounded-xl animate-scale-in"
              style={{ background: 'var(--bg-3)', border: '1px solid var(--line-2)' }}>
              <p className="text-[10px] font-bold font-mono uppercase mb-2" style={{ color: 'var(--fg-4)' }}>Historia edycji</p>
              {history.map((h, i) => (
                <div key={i} className="text-xs mb-1" style={{ color: 'var(--fg-3)' }}>
                  <span className="font-mono text-[10px]" style={{ color: 'var(--fg-4)' }}>{formatDate(h.date)}</span>: {h.content}
                </div>
              ))}
            </div>
          )}

          {!isEditing && !isDeleted && (
            <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-all">
              {[
                { action: () => onReply(c), label: 'Odpowiedz', icon: <Reply className="w-3 h-3" />, color: 'var(--ember)' },
                ...(c.user_id === user?.id || isDev ? [{ action: () => onStartEdit(c), label: 'Edytuj', icon: <Pencil className="w-3 h-3" />, color: 'var(--warn)' }] : []),
                ...(canMod ? [{ action: () => onDelete(c.id), label: 'Usuń', icon: <Trash2 className="w-3 h-3" />, color: 'var(--err)' }] : []),
              ].map(({ action, label, icon, color }) => (
                <button key={label} onClick={action}
                  className="text-[11px] px-2 py-1 rounded-lg flex items-center gap-1 transition-all font-mono"
                  style={{ color: 'var(--fg-4)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = color; e.currentTarget.style.background = color + '15'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-4)'; e.currentTarget.style.background = ''; }}>
                  {icon} {label}
                </button>
              ))}
            </div>
          )}
          {isDeleted && isDev && (
            <button onClick={() => onHardDelete(c.id)}
              className="text-[10px] font-mono mt-1 transition-colors"
              style={{ color: 'var(--err)' }}>
              Usuń całkowicie{replies.length > 0 ? ` (+ ${replies.length} odp.)` : ''}
            </button>
          )}
        </div>
      </div>
      {replies.map(r => (
        <CommentNode key={r.id} c={r} depth={depth + 1} replies={r._replies || []} user={user}
          editingId={editingId} editContent={editContent} setEditContent={setEditContent}
          silentEdit={silentEdit} setSilentEdit={setSilentEdit}
          onStartEdit={onStartEdit} onSaveEdit={onSaveEdit} onCancelEdit={onCancelEdit}
          onReply={onReply} onDelete={onDelete} onHardDelete={onHardDelete}
          editHistoryId={editHistoryId} setEditHistoryId={setEditHistoryId} />
      ))}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function VideoPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fromCategory = searchParams.get('from') || '';
  const slideDir = searchParams.get('slide') || '';
  const navigate = useNavigate();
  const { user } = useAuth();

  const [video, setVideo]             = useState(null);
  const [loading, setLoading]         = useState(true);
  const [activeSource, setActiveSource] = useState('main');
  const [error, setError]             = useState(null);
  const [isFav, setIsFav]             = useState(false);
  const [favCount, setFavCount]       = useState(0);
  const [favLoading, setFavLoading]   = useState(false);
  const [prevVideo, setPrevVideo]     = useState(null);
  const [nextVideo, setNextVideo]     = useState(null);
  const [canEdit, setCanEdit]         = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editUsers, setEditUsers]     = useState([]);
  const [comments, setComments]       = useState([]);
  const [newComment, setNewComment]   = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [replyTo, setReplyTo]         = useState(null);
  const [editingComment, setEditingComment] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [silentEdit, setSilentEdit]   = useState(false);
  const [deleteConfirm, setDeleteConfirm]     = useState(null);
  const [hardDeleteConfirm, setHardDeleteConfirm] = useState(null);
  const [editHistoryPopup, setEditHistoryPopup]   = useState(null);
  const playerControlRef = useRef(null);
  const progressStateRef = useRef({ id: null, position: 0, duration: 0, completed: false, lastSaved: 0 });
  const [resumePosition, setResumePosition]     = useState(null);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [devOpen, setDevOpen]         = useState(false);
  const [devUserId, setDevUserId]     = useState('');
  const [devContent, setDevContent]   = useState('');
  const [devDate, setDevDate]         = useState('');
  const [devParent, setDevParent]     = useState('');
  const [allUsers, setAllUsers]       = useState([]);
  const [phase, setPhase]             = useState('show');
  const [exitDir, setExitDir]         = useState('');
  const [pendingSlide, setPendingSlide] = useState(slideDir);

  useEffect(() => {
    setActiveSource('main');
    setPrevVideo(null); setNextVideo(null);
    setEditingComment(null); setEditContent('');
    setComments([]); setReplyTo(null);
    setResumePosition(null); setShowResumeBanner(false);
    const vid = Number(id);
    if (video) setPhase('hidden'); else setLoading(true);
    Promise.all([
      api.getVideo(id),
      api.checkFavorite(id).catch(() => ({ isFavorite: false, count: 0 })),
    ]).then(([v, f]) => {
      setVideo(v); setIsFav(f.isFavorite); setFavCount(f.count || 0); setError(null);
      setPendingSlide(slideDir); setPhase('entering');
      const admin = user?.role === 'admin' || user?.role === 'dev';
      if (admin) setCanEdit(true);
      else if (v.category_id) api.getCategories().then(cats => setCanEdit(cats.find(c => c.id === v.category_id)?.canEdit || false)).catch(() => setCanEdit(false));
      else setCanEdit(false);
      const lp = fromCategory ? { category: fromCategory } : {};
      api.getVideos(lp).then(vids => {
        if (!Array.isArray(vids) || !vids.length) return;
        const idx = vids.findIndex(v2 => Number(v2.id) === vid);
        if (idx > 0) setPrevVideo(vids[idx - 1]);
        if (idx >= 0 && idx < vids.length - 1) setNextVideo(vids[idx + 1]);
      }).catch(() => {});
      api.getComments(vid).then(setComments).catch(() => setComments([]));
      api.getProgress(vid).then(p => {
        if (p && p.duration > 0 && p.position > p.duration * 0.05 && p.position < p.duration * 0.90) {
          setResumePosition(p.position); setShowResumeBanner(true);
        }
      }).catch(() => {});
    }).catch(err => setError(err.message)).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    progressStateRef.current = { id, position: 0, duration: 0, completed: false, lastSaved: 0 };
    return () => {
      const s = progressStateRef.current;
      if (!s.id || !s.duration || s.completed) return;
      const pct = s.position / s.duration;
      if (pct < 0.05 || pct >= 0.90) return;
      fetch(`/api/progress/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position: s.position, duration: s.duration }), credentials: 'include', keepalive: true }).catch(() => {});
    };
  }, [id]);

  useEffect(() => { if (user?.role === 'dev' && devOpen && !allUsers.length) api.getAllUsers().then(setAllUsers).catch(() => {}); }, [devOpen]);

  const goToVideo = (videoId, dir) => {
    if (phase === 'exiting') return;
    setPhase('exiting');
    setExitDir(dir === 'next' ? 'anim-exit-left' : 'anim-exit-right');
    const p = new URLSearchParams();
    if (fromCategory) p.set('from', fromCategory);
    p.set('slide', dir === 'next' ? 'right' : 'left');
    setTimeout(() => navigate(`/video/${videoId}?${p.toString()}`), 350);
  };

  const toggleFav = async () => {
    setFavLoading(true);
    try { if (isFav) { await api.removeFavorite(id); setIsFav(false); setFavCount(c => Math.max(0, c - 1)); } else { await api.addFavorite(id); setIsFav(true); setFavCount(c => c + 1); } } catch (e) {}
    setFavLoading(false);
  };
  const openEditModal = async () => { try { setEditUsers(await api.getAllUsers()); } catch (e) { setEditUsers([]); } setShowEditModal(true); };
  const submitComment = async () => {
    if (!newComment.trim() || commentLoading) return; setCommentLoading(true);
    try { const c = await api.addComment(id, newComment.trim(), replyTo?.id || null); setComments(p => [...p, c]); setNewComment(''); setReplyTo(null); } catch (e) {}
    setCommentLoading(false);
  };
  const submitDev = async () => {
    if (!devUserId || !devContent.trim()) return;
    try { const c = await api.addAdminComment({ video_id: Number(id), user_id: Number(devUserId), content: devContent.trim(), created_at: devDate || undefined, parent_id: devParent ? Number(devParent) : null }); setComments(p => [...p, c]); setDevContent(''); } catch (e) {}
  };
  const onStartEdit  = useCallback((c) => { setEditingComment(c.id); setEditContent(c.content); setSilentEdit(false); }, []);
  const onSaveEdit   = useCallback(async (cid) => { if (!editContent.trim()) return; try { const u = await api.editComment(cid, editContent.trim(), silentEdit); setComments(p => p.map(c => c.id === cid ? u : c)); setEditingComment(null); setEditContent(''); } catch (e) {} }, [editContent, silentEdit]);
  const onCancelEdit = useCallback(() => { setEditingComment(null); setEditContent(''); }, []);
  const onReply      = useCallback((c) => { setReplyTo(c); setNewComment(''); }, []);
  const onDelete     = useCallback((cid) => setDeleteConfirm(cid), []);
  const onHardDelete = useCallback((cid) => setHardDeleteConfirm(cid), []);
  const softDel = async () => { if (!deleteConfirm) return; try { await api.deleteComment(deleteConfirm); setComments(p => p.map(c => c.id === deleteConfirm ? { ...c, deleted: 1, content: '' } : c)); } catch (e) {} setDeleteConfirm(null); };
  const hardDel = async () => {
    if (!hardDeleteConfirm) return;
    try { await api.hardDeleteComment(hardDeleteConfirm); const rm = new Set([hardDeleteConfirm]); const walk = pid => comments.filter(c => c.parent_id === pid).forEach(c => { rm.add(c.id); walk(c.id); }); walk(hardDeleteConfirm); setComments(p => p.filter(c => !rm.has(c.id))); } catch (e) {}
    setHardDeleteConfirm(null);
  };
  const handleTimeUpdate = useCallback((currentTime, duration) => {
    if (!duration || duration <= 0) return;
    const pct = currentTime / duration;
    const s = progressStateRef.current;
    s.position = currentTime; s.duration = duration;
    if (pct >= 0.90) { if (!s.completed) { s.completed = true; api.clearProgress(id).catch(() => {}); } return; }
    s.completed = false; if (pct < 0.05) return;
    const now = Date.now();
    if (now - s.lastSaved > 10000) { s.lastSaved = now; api.saveProgress(id, currentTime, duration).catch(() => {}); }
  }, [id]);

  const tree = useMemo(() => {
    const m = {}; comments.forEach(c => { m[c.id] = { ...c, _replies: [] }; });
    const roots = [];
    comments.forEach(c => { if (c.parent_id && m[c.parent_id]) m[c.parent_id]._replies.push(m[c.id]); else roots.push(m[c.id]); });
    return roots;
  }, [comments]);

  // ── Loading / error states ──
  if (loading && !video) return (
    <div className="px-8 sm:px-12 py-12 max-w-5xl mx-auto animate-fade-in">
      <div className="skeleton rounded-[20px] mb-6" style={{ aspectRatio: '16/9' }} />
      <div className="h-8 skeleton rounded-xl w-2/3 mb-4" />
      <div className="h-4 skeleton rounded-xl w-1/3" />
    </div>
  );
  if (error || !video) return (
    <div className="px-8 sm:px-12 py-12 max-w-5xl mx-auto animate-scale-in">
      <div className="p-16 text-center rounded-[20px]" style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)' }}>
        <p className="font-bold text-lg mb-2" style={{ color: 'var(--err)' }}>Błąd</p>
        <p className="text-sm" style={{ color: 'var(--fg-3)' }}>{error || 'Film nie znaleziony.'}</p>
        <Link to="/" className="btn-primary mt-6 inline-block text-sm">Wróć</Link>
      </div>
    </div>
  );

  const src = activeSource === 'mirror1' ? { url: video.mirror1_url, type: video.mirror1_type || (video.mirror1_is_embed ? 'embed' : 'link') }
    : activeSource === 'mirror2' ? { url: video.mirror2_url, type: video.mirror2_type || (video.mirror2_is_embed ? 'embed' : 'link') }
    : activeSource === 'mirror3' ? { url: video.mirror3_url, type: video.mirror3_type || 'link' }
    : activeSource === 'mirror4' ? { url: video.mirror4_url, type: video.mirror4_type || 'link' }
    : activeSource === 'mirror5' ? { url: video.mirror5_url, type: video.mirror5_type || 'link' }
    : { url: video.main_source, type: video.main_source_type };

  const isStreamer = src.type === 'streamer';
  const streamerVideoId = isStreamer ? src.url?.replace('self-hosted:', '') : null;
  const isPlex    = src.type === 'plex';
  const isHtml    = src.type === 'embed' || src.type === 'html';
  const embedUrl  = (isHtml || isPlex || isStreamer) ? null : youtubeToEmbed(src.url);
  const sources   = [
    { key: 'main', label: video.main_source_title || 'Główne źródło' },
    ...(video.mirror1_url ? [{ key: 'mirror1', label: video.mirror1_name || 'Mirror 1' }] : []),
    ...(video.mirror2_url ? [{ key: 'mirror2', label: video.mirror2_name || 'Mirror 2' }] : []),
    ...(video.mirror3_url ? [{ key: 'mirror3', label: video.mirror3_name || 'Mirror 3' }] : []),
    ...(video.mirror4_url ? [{ key: 'mirror4', label: video.mirror4_name || 'Mirror 4' }] : []),
    ...(video.mirror5_url ? [{ key: 'mirror5', label: video.mirror5_name || 'Mirror 5' }] : []),
  ];
  const isDev         = user?.role === 'dev';
  const activeCount   = comments.filter(c => !c.deleted).length;
  const enterAnim     = pendingSlide === 'right' ? 'anim-enter-right' : pendingSlide === 'left' ? 'anim-enter-left' : 'anim-enter-up';
  const wrapperClass  = phase === 'exiting' ? exitDir : phase === 'entering' ? enterAnim : phase === 'hidden' ? 'opacity-0' : '';

  return (
    <>
      <div className={`px-6 sm:px-10 py-10 max-w-5xl mx-auto ${wrapperClass}`}
        onAnimationEnd={() => { if (phase === 'entering') setPhase('show'); }}>

        {/* ── Back button ── */}
        <button
          onClick={() => navigate(fromCategory ? `/category/${fromCategory}` : '/')}
          className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-full text-sm font-mono font-bold uppercase tracking-[0.1em] transition-all group"
          style={{ border: '1px solid var(--line-2)', color: 'var(--fg-3)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--ember)'; e.currentTarget.style.borderColor = 'rgba(255,91,46,0.30)'; e.currentTarget.style.background = 'rgba(255,91,46,0.05)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-3)'; e.currentTarget.style.borderColor = 'var(--line-2)'; e.currentTarget.style.background = ''; }}
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
          {fromCategory ? 'Wróć do kategorii' : 'Wróć do bazy'}
        </button>

        {/* ── Header ── */}
        <div className="mb-6 anim-stagger-1">
          <div className="mb-1">
            <span className="mono-label">{video.category_name || 'Alleria Filmy'}</span>
          </div>

          <div className="flex items-start gap-3">
            <h1 className="flex-1 font-bold leading-tight tracking-tight"
              style={{ fontSize: 'clamp(22px, 3.5vw, 36px)', color: 'var(--fg)', letterSpacing: '-0.03em' }}>
              {video.title}
            </h1>

            <div className="flex items-center gap-2 shrink-0 mt-1">
              {canEdit && (
                <button onClick={openEditModal}
                  className="p-2.5 rounded-xl transition-all hover:scale-110 active:scale-95"
                  style={{ background: 'rgba(255,91,46,0.08)', color: 'var(--ember-2)', border: '1px solid rgba(255,91,46,0.20)' }}>
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              <button onClick={toggleFav} disabled={favLoading}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl transition-all hover:scale-105 active:scale-95"
                style={isFav
                  ? { background: 'rgba(255,91,46,0.12)', color: 'var(--ember)', border: '1px solid rgba(255,91,46,0.25)', boxShadow: '0 4px 20px rgba(255,91,46,0.20)' }
                  : { background: 'rgba(246,246,250,0.05)', color: 'var(--fg-4)', border: '1px solid var(--line)' }
                }>
                <Heart className={`w-4 h-4 transition-all ${isFav ? 'fill-current' : ''}`} />
                {favCount > 0 && <span className="text-xs font-bold font-mono">{favCount}</span>}
              </button>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
            <Link to={`/author/${video.author_id}`}
              className="text-sm font-bold no-underline transition-colors"
              style={{ color: 'var(--ember-2)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--ember)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--ember-2)'; }}>
              {video.author_display_name || video.author_name}
            </Link>
            <span className="text-[11px] font-mono" style={{ color: 'var(--fg-4)' }}>
              {formatDate(video.publish_date)}
            </span>
            {video.category_name && (
              <>
                <span style={{ color: 'var(--line-2)' }}>·</span>
                <Link to={`/category/${video.category_slug}`}
                  className="text-[11px] font-mono no-underline transition-colors"
                  style={{ color: 'var(--fg-4)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--ember)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-4)'; }}>
                  {video.category_name}
                </Link>
              </>
            )}
          </div>

          {/* Tags */}
          {video.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {video.tags.map(t => (
                <Link key={t.id} to={`/?tags=${t.id}`}
                  className="text-[11px] font-bold font-mono px-2.5 py-1 rounded-full no-underline transition-all hover:scale-105"
                  style={{ background: 'rgba(255,91,46,0.10)', color: 'var(--ember-2)', border: '1px solid rgba(255,91,46,0.22)' }}>
                  {t.name}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── Player ── */}
        <div className="mb-3 anim-stagger-2 rounded-[20px] overflow-hidden"
          style={{ border: '1px solid var(--line-2)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
          key={`player-${activeSource}`}>
          {video.stream_video_id && video.stream_status === 'ready' && activeSource === 'main' ? (
            <SecurePlayer streamVideoId={video.stream_video_id} drmEnhanced={video.drm_enhanced} title={video.title} controlRef={playerControlRef} onTimeUpdate={handleTimeUpdate} />
          ) : isStreamer && streamerVideoId ? (
            <SecurePlayer streamVideoId={streamerVideoId} drmEnhanced={false} title={video.title} controlRef={playerControlRef} onTimeUpdate={handleTimeUpdate} />
          ) : isPlex && src.url ? (
            <div className="aspect-video plex-container flex items-center justify-center">
              <div className="plex-particle w-2 h-2 bg-amber-400/40 top-[20%] left-[15%]" style={{ animation: 'plexFloat1 6s ease-in-out infinite' }} />
              <div className="plex-particle w-1.5 h-1.5 bg-emerald-400/30 top-[60%] right-[20%]" style={{ animation: 'plexFloat2 8s ease-in-out infinite 1s' }} />
              <div className="plex-particle w-2.5 h-2.5 bg-amber-500/20 top-[35%] right-[35%]" style={{ animation: 'plexFloat1 9s ease-in-out infinite 3s' }} />
              <div className="flex flex-col items-center gap-6 p-10 relative z-10">
                <img src="https://alleria.pl/image/plex-play.png" alt="Plex" className="plex-logo w-20 h-20 object-contain mb-1" />
                <a href={src.url} target="_blank" rel="noopener noreferrer"
                  className="plex-btn-primary block w-[280px] text-center py-4 px-8 rounded-2xl font-bold text-lg text-zinc-900 no-underline tracking-wide">
                  ▶ Oglądaj w Plex
                </a>
                <a href="https://alleria.pl/plex/plex_access.php" target="_blank" rel="noopener noreferrer"
                  className="plex-btn-access block w-[280px] text-center py-3.5 px-8 rounded-2xl font-semibold text-base no-underline tracking-wide">
                  Uzyskaj dostęp do Plex
                </a>
                <a href="https://alleria.pl/plex/" target="_blank" rel="noopener noreferrer"
                  className="plex-btn-info block text-center py-2.5 px-6 rounded-xl text-sm no-underline">
                  Czym jest Plex?
                </a>
              </div>
            </div>
          ) : embedUrl ? (
            <div className="aspect-video"><YouTubeTrackingPlayer videoId={extractYoutubeId(src.url)} onTimeUpdate={handleTimeUpdate} controlRef={playerControlRef} /></div>
          ) : isHtml && src.url ? (
            <div className="aspect-video"><HtmlEmbed html={src.url} /></div>
          ) : (
            <div className="aspect-video flex items-center justify-center" style={{ background: 'var(--bg-3)' }}>
              <p className="text-sm" style={{ color: 'var(--fg-4)' }}>Brak źródła.</p>
            </div>
          )}
        </div>

        {/* ── Resume banner ── */}
        {showResumeBanner && resumePosition !== null && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-2xl animate-scale-in"
            style={{ background: 'rgba(255,91,46,0.08)', border: '1px solid rgba(255,91,46,0.22)' }}>
            <span className="text-sm font-medium flex-1" style={{ color: 'var(--ember-2)' }}>
              Kontynuuj od {Math.floor(resumePosition / 60)}:{String(Math.floor(resumePosition % 60)).padStart(2, '0')}?
            </span>
            <button onClick={() => { playerControlRef.current?.seek(resumePosition); setShowResumeBanner(false); }}
              className="px-4 py-1.5 rounded-xl text-sm font-bold text-white transition-all hover:brightness-110"
              style={{ background: 'var(--ember)' }}>
              Kontynuuj
            </button>
            <button onClick={() => setShowResumeBanner(false)}
              className="px-4 py-1.5 rounded-xl text-sm font-bold transition-all"
              style={{ background: 'rgba(246,246,250,0.06)', color: 'var(--fg-3)', border: '1px solid var(--line-2)' }}>
              Od początku
            </button>
          </div>
        )}

        {/* ── Source selector ── */}
        {sources.length > 1 && (
          <div className="flex gap-2 mb-5 flex-wrap anim-stagger-3">
            {sources.map(s => (
              <button key={s.key} onClick={() => setActiveSource(s.key)}
                className="px-4 py-2 rounded-full text-xs font-bold font-mono uppercase tracking-wider transition-all hover:scale-105 active:scale-95"
                style={activeSource === s.key
                  ? { background: 'var(--ember)', color: '#fff', boxShadow: '0 4px 16px rgba(255,91,46,0.30)' }
                  : { background: 'rgba(246,246,250,0.05)', color: 'var(--fg-3)', border: '1px solid var(--line-2)' }
                }>
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Prev / Next ── */}
        {(prevVideo || nextVideo) && (
          <div className="flex items-stretch gap-3 sm:gap-4 mb-6 anim-stagger-4">
            {prevVideo ? (
              <button onClick={() => goToVideo(prevVideo.id, 'prev')}
                className="flex-1 min-w-0 max-w-[50%] p-4 text-left rounded-[20px] transition-all group"
                style={{ background: 'rgba(246,246,250,0.03)', border: '1px solid var(--line-2)' }}
                onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--mx', `${((e.clientX - r.left) / r.width * 100)}%`); e.currentTarget.style.setProperty('--my', `${((e.clientY - r.top) / r.height * 100)}%`); }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,91,46,0.22)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line-2)'; }}>
                <div className="flex items-center gap-1.5 text-xs font-bold font-mono uppercase tracking-wider mb-1.5 transition-transform group-hover:-translate-x-0.5"
                  style={{ color: 'var(--ember)' }}>
                  <ChevronLeft className="w-3.5 h-3.5" /> poprzedni
                </div>
                <p className="text-sm font-medium truncate" style={{ color: 'var(--fg-2)' }}>{prevVideo.title}</p>
              </button>
            ) : <div className="flex-1" />}

            {nextVideo ? (
              <button onClick={() => goToVideo(nextVideo.id, 'next')}
                className="flex-1 min-w-0 max-w-[50%] p-4 text-right ml-auto rounded-[20px] transition-all group"
                style={{ background: 'rgba(246,246,250,0.03)', border: '1px solid var(--line-2)' }}
                onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--mx', `${((e.clientX - r.left) / r.width * 100)}%`); e.currentTarget.style.setProperty('--my', `${((e.clientY - r.top) / r.height * 100)}%`); }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,91,46,0.22)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line-2)'; }}>
                <div className="flex items-center justify-end gap-1.5 text-xs font-bold font-mono uppercase tracking-wider mb-1.5 transition-transform group-hover:translate-x-0.5"
                  style={{ color: 'var(--ember)' }}>
                  następny <ChevronRight className="w-3.5 h-3.5" />
                </div>
                <p className="text-sm font-medium truncate" style={{ color: 'var(--fg-2)' }}>{nextVideo.title}</p>
              </button>
            ) : <div className="flex-1" />}
          </div>
        )}

        {/* ── Description ── */}
        {video.description && (
          <div className="p-6 rounded-[20px] mb-5 anim-stagger-5"
            style={{ background: 'rgba(246,246,250,0.03)', border: '1px solid var(--line-2)' }}>
            <span className="mono-label block mb-3">Opis</span>
            <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--fg-3)' }}>
              {video.description}
            </div>
          </div>
        )}

        {/* ── Comments ── */}
        <div className="p-6 rounded-[20px] anim-stagger-6"
          style={{ background: 'rgba(246,246,250,0.02)', border: '1px solid var(--line-2)' }}>
          {/* Header */}
          <div className="flex items-center justify-between mb-6" style={{ borderBottom: '1px solid var(--line)', paddingBottom: '16px' }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(255,91,46,0.10)', border: '1px solid rgba(255,91,46,0.22)' }}>
                <MessageCircle className="w-4 h-4" style={{ color: 'var(--ember)' }} />
              </div>
              <div>
                <h3 className="font-bold text-base" style={{ color: 'var(--fg)' }}>Komentarze</h3>
                <span className="text-[11px] font-mono" style={{ color: 'var(--fg-4)' }}>{activeCount} wpisów</span>
              </div>
            </div>
            {isDev && (
              <button onClick={() => setDevOpen(!devOpen)}
                className="text-[10px] font-bold font-mono px-3 py-1.5 rounded-xl transition-all"
                style={{ color: 'var(--warn)', background: 'rgba(245,185,88,0.08)', border: '1px solid rgba(245,185,88,0.20)' }}>
                DEV: Dodaj jako…
              </button>
            )}
          </div>

          {/* Dev form */}
          {devOpen && isDev && (
            <div className="mb-6 p-4 rounded-2xl space-y-3 animate-scale-in"
              style={{ background: 'rgba(245,185,88,0.04)', border: '1px solid rgba(245,185,88,0.18)' }}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <select value={devUserId} onChange={e => setDevUserId(e.target.value)} className="glass-select !py-2 text-xs">
                  <option value="">Użytkownik...</option>
                  {allUsers.map(u => <option key={u.id} value={u.id}>{u.display_name || u.username}</option>)}
                </select>
                <input type="datetime-local" value={devDate} onChange={e => setDevDate(e.target.value)} className="glass-input !py-2 text-xs" />
                <input type="text" value={devParent} onChange={e => setDevParent(e.target.value)} className="glass-input !py-2 text-xs" placeholder="Parent ID" />
                <button onClick={submitDev} disabled={!devUserId || !devContent.trim()} className="btn-primary !py-2 text-xs">Dodaj</button>
              </div>
              <textarea value={devContent} onChange={e => setDevContent(e.target.value)} className="glass-input text-sm resize-none" rows={2} placeholder="Treść..." />
            </div>
          )}

          {/* Reply to */}
          {replyTo && (
            <div className="flex items-center gap-2 mb-3 p-2 rounded-xl text-sm animate-scale-in"
              style={{ background: 'rgba(255,91,46,0.06)', border: '1px solid rgba(255,91,46,0.18)' }}>
              <Reply className="w-4 h-4" style={{ color: 'var(--ember)' }} />
              <span style={{ color: 'var(--ember-2)' }}>
                Odpowiedź do <strong>{replyTo.display_name || replyTo.username}</strong>
              </span>
              <button onClick={() => setReplyTo(null)} className="ml-auto p-1 rounded-lg transition-all hover:scale-110"
                style={{ color: 'var(--ember)' }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* New comment */}
          <div className="flex gap-3 mb-6">
            <img src={user?.avatar || `https://ui-avatars.com/api/?name=${user?.display_name || 'U'}&background=ff5b2e&color=fff&size=80`}
              alt="" className="w-9 h-9 rounded-xl shrink-0 object-cover" style={{ border: '1px solid var(--line-2)' }} />
            <div className="flex-1 relative">
              <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
                placeholder={replyTo ? 'Odpowiedz…' : 'Napisz komentarz…'}
                className="glass-input resize-none text-sm pr-12"
                style={{ minHeight: '46px', maxHeight: '120px' }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
                rows={1} />
              <button onClick={submitComment} disabled={!newComment.trim() || commentLoading}
                className="absolute right-3 top-3 p-1.5 rounded-lg transition-all hover:scale-110 active:scale-90 disabled:opacity-30"
                style={{ color: 'var(--ember)' }}>
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Comments list */}
          {tree.length === 0
            ? <p className="text-sm text-center py-8 font-mono" style={{ color: 'var(--fg-4)' }}>
                Brak komentarzy — bądź pierwszą osobą!
              </p>
            : <div className="space-y-1">
                {tree.map(c => (
                  <CommentNode key={c.id} c={c} depth={0} replies={c._replies} user={user}
                    editingId={editingComment} editContent={editContent} setEditContent={setEditContent}
                    silentEdit={silentEdit} setSilentEdit={setSilentEdit}
                    onStartEdit={onStartEdit} onSaveEdit={onSaveEdit} onCancelEdit={onCancelEdit}
                    onReply={onReply} onDelete={onDelete} onHardDelete={onHardDelete}
                    editHistoryId={editHistoryPopup} setEditHistoryId={setEditHistoryPopup} />
                ))}
              </div>
          }
        </div>
      </div>

      {/* ── Modals ── */}
      {deleteConfirm && (
        <Portal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ background: 'rgba(10,10,16,0.80)', backdropFilter: 'blur(14px)' }}>
            <div onClick={() => setDeleteConfirm(null)} className="absolute inset-0" />
            <div className="relative z-10 max-w-sm w-full p-8 text-center rounded-[28px] animate-scale-in"
              style={{ background: 'var(--bg-3)', border: '1px solid var(--line-2)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(239,111,108,0.12)', border: '1px solid rgba(239,111,108,0.25)' }}>
                <Trash2 className="w-6 h-6" style={{ color: 'var(--err)' }} />
              </div>
              <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--fg)' }}>Usunąć komentarz?</h3>
              <p className="text-sm mb-6" style={{ color: 'var(--fg-3)' }}>Treść zostanie ukryta, wątek zachowany.</p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => setDeleteConfirm(null)} className="btn-secondary text-sm">Anuluj</button>
                <button onClick={softDel} className="btn-danger text-sm">Usuń</button>
              </div>
            </div>
          </div>
        </Portal>
      )}
      {hardDeleteConfirm && (
        <Portal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ background: 'rgba(10,10,16,0.80)', backdropFilter: 'blur(14px)' }}>
            <div onClick={() => setHardDeleteConfirm(null)} className="absolute inset-0" />
            <div className="relative z-10 max-w-sm w-full p-8 text-center rounded-[28px] animate-scale-in"
              style={{ background: 'var(--bg-3)', border: '1px solid var(--line-2)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(239,111,108,0.12)', border: '1px solid rgba(239,111,108,0.25)' }}>
                <AlertTriangle className="w-6 h-6" style={{ color: 'var(--err)' }} />
              </div>
              <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--fg)' }}>Usunąć permanentnie?</h3>
              <p className="text-sm mb-6" style={{ color: 'var(--fg-3)' }}>Komentarz i odpowiedzi usunięte na zawsze.</p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => setHardDeleteConfirm(null)} className="btn-secondary text-sm">Anuluj</button>
                <button onClick={hardDel} className="btn-danger text-sm">Usuń</button>
              </div>
            </div>
          </div>
        </Portal>
      )}
      {showEditModal && (
        <Portal>
          <VideoModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} video={video} users={editUsers}
            onSaved={() => { setShowEditModal(false); api.getVideo(id).then(v => setVideo(v)).catch(() => {}); }} />
        </Portal>
      )}
    </>
  );
}
