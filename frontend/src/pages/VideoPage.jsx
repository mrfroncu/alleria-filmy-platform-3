import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowLeft, Heart, Pencil, MessageCircle, Send, Trash2, Reply, Check, X, AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';
import { formatDate, youtubeToEmbed } from '../utils/helpers';
import { useAuth } from '../contexts/AuthContext';
import SecurePlayer from '../components/SecurePlayer';
import VideoModal from '../components/VideoModal';

// Portal — renders children directly into document.body, bypassing any CSS transform ancestors
function Portal({ children }) {
  return ReactDOM.createPortal(children, document.body);
}

// Comment component — defined outside VideoPage to prevent remount on parent state change
function CommentNode({ c, depth, replies, user, editingId, editContent, setEditContent, silentEdit, setSilentEdit, onStartEdit, onSaveEdit, onCancelEdit, onReply, onDelete, onHardDelete, editHistoryId, setEditHistoryId }) {
  const isEditing = editingId === c.id;
  const isDev = user?.role === 'dev';
  const canMod = c.user_id === user?.id || user?.role === 'admin' || isDev;
  const isDeleted = c.deleted === 1;
  let history = [];
  try { history = JSON.parse(c.edit_history || '[]'); } catch (e) {}

  return (
    <div className={depth > 0 ? 'ml-6 sm:ml-10 border-l-2 border-violet-200/50 dark:border-violet-800/30 pl-4' : ''}>
      <div className="flex gap-3 group py-2 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 -mx-2 px-2 rounded-xl transition-colors">
        <img src={c.avatar || `https://ui-avatars.com/api/?name=${c.display_name || c.username || 'U'}&background=8b5cf6&color=fff&size=80`} alt="" className={`w-8 h-8 rounded-xl shrink-0 object-cover mt-0.5 ${isDeleted ? 'opacity-40 grayscale' : ''}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className={`text-sm font-bold ${isDeleted ? 'text-zinc-400' : 'text-zinc-900 dark:text-white'}`}>{c.display_name || c.username}</span>
            <span className="text-[10px] text-zinc-400 font-mono">{formatDate(c.created_at)}</span>
            {c.edited === 1 && !isDeleted && (
              <button onClick={() => setEditHistoryId(editHistoryId === c.id ? null : c.id)} className="text-[9px] text-zinc-400 hover:text-violet-500 transition-colors">(edytowano)</button>
            )}
          </div>
          {isDeleted ? (
            <p className="text-sm text-zinc-400 italic">(komentarz usunięty)</p>
          ) : isEditing ? (
            <div className="space-y-2" onClick={e => e.stopPropagation()}>
              <textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="input-field !py-2 !px-3 text-sm resize-none" rows={2} autoFocus />
              <div className="flex items-center gap-2">
                <button onClick={() => onSaveEdit(c.id)} className="p-1.5 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-all hover:scale-110"><Check className="w-4 h-4" /></button>
                <button onClick={onCancelEdit} className="p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all hover:scale-110"><X className="w-4 h-4" /></button>
                {isDev && (
                  <label className="flex items-center gap-1.5 text-[10px] text-amber-500 cursor-pointer ml-2 select-none">
                    <input type="checkbox" checked={silentEdit} onChange={e => setSilentEdit(e.target.checked)} className="w-3 h-3 rounded" />
                    Ciche (bez śladu)
                  </label>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words">{c.content}</p>
          )}
          {editHistoryId === c.id && history.length > 0 && (
            <div className="mt-2 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 animate-scale-in">
              <p className="text-[10px] font-bold text-zinc-500 uppercase mb-2">Historia edycji</p>
              {history.map((h, i) => <div key={i} className="text-xs text-zinc-500 mb-1"><span className="font-mono text-[10px]">{formatDate(h.date)}</span>: {h.content}</div>)}
            </div>
          )}
          {!isEditing && !isDeleted && (
            <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-all">
              <button onClick={() => onReply(c)} className="text-[11px] text-zinc-400 hover:text-violet-500 px-2 py-1 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-all flex items-center gap-1"><Reply className="w-3 h-3" /> Odpowiedz</button>
              {(c.user_id === user?.id || isDev) && <button onClick={() => onStartEdit(c)} className="text-[11px] text-zinc-400 hover:text-amber-500 px-2 py-1 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-all flex items-center gap-1"><Pencil className="w-3 h-3" /> Edytuj</button>}
              {canMod && <button onClick={() => onDelete(c.id)} className="text-[11px] text-zinc-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-all flex items-center gap-1"><Trash2 className="w-3 h-3" /> Usuń</button>}
            </div>
          )}
          {isDeleted && isDev && (
            <button onClick={() => onHardDelete(c.id)} className="text-[10px] text-red-400 hover:text-red-500 mt-1 transition-colors">
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

// ─── Main VideoPage ───
export default function VideoPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fromCategory = searchParams.get('from') || '';
  const slideFrom = searchParams.get('slide') || '';
  const navigate = useNavigate();
  const { user } = useAuth();

  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSource, setActiveSource] = useState('main');
  const [error, setError] = useState(null);
  const [isFav, setIsFav] = useState(false);
  const [favCount, setFavCount] = useState(0);
  const [favLoading, setFavLoading] = useState(false);
  const [prevVideo, setPrevVideo] = useState(null);
  const [nextVideo, setNextVideo] = useState(null);
  const [canEdit, setCanEdit] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editUsers, setEditUsers] = useState([]);
  const [exiting, setExiting] = useState(false);
  const [exitClass, setExitClass] = useState('');

  // Comments
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [editingComment, setEditingComment] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [silentEdit, setSilentEdit] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [hardDeleteConfirm, setHardDeleteConfirm] = useState(null);
  const [editHistoryPopup, setEditHistoryPopup] = useState(null);

  // Dev comment
  const [devOpen, setDevOpen] = useState(false);
  const [devUserId, setDevUserId] = useState('');
  const [devContent, setDevContent] = useState('');
  const [devDate, setDevDate] = useState('');
  const [devParent, setDevParent] = useState('');
  const [allUsers, setAllUsers] = useState([]);

  useEffect(() => {
    setExiting(false); setExitClass('');
    setLoading(true); setActiveSource('main');
    setPrevVideo(null); setNextVideo(null);
    setEditingComment(null); setEditContent('');
    const vid = Number(id);
    Promise.all([
      api.getVideo(id),
      api.checkFavorite(id).catch(() => ({ isFavorite: false, count: 0 })),
    ]).then(([v, f]) => {
      setVideo(v); setIsFav(f.isFavorite); setFavCount(f.count || 0); setError(null);
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
    }).catch(err => setError(err.message)).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { if (user?.role === 'dev' && devOpen && !allUsers.length) api.getAllUsers().then(setAllUsers).catch(() => {}); }, [devOpen]);

  const goToVideo = (videoId, dir) => {
    if (exiting) return;
    setExiting(true);
    setExitClass(dir === 'next' ? 'anim-exit-left' : 'anim-exit-right');
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
    if (!newComment.trim() || commentLoading) return;
    setCommentLoading(true);
    try { const c = await api.addComment(id, newComment.trim(), replyTo?.id || null); setComments(p => [...p, c]); setNewComment(''); setReplyTo(null); } catch (e) {}
    setCommentLoading(false);
  };

  const submitDev = async () => {
    if (!devUserId || !devContent.trim()) return;
    try { const c = await api.addAdminComment({ video_id: Number(id), user_id: Number(devUserId), content: devContent.trim(), created_at: devDate || undefined, parent_id: devParent ? Number(devParent) : null }); setComments(p => [...p, c]); setDevContent(''); setDevDate(''); setDevParent(''); } catch (e) {}
  };

  const onStartEdit = useCallback((c) => { setEditingComment(c.id); setEditContent(c.content); setSilentEdit(false); }, []);
  const onSaveEdit = useCallback(async (cid) => {
    if (!editContent.trim()) return;
    try { const u = await api.editComment(cid, editContent.trim(), silentEdit); setComments(p => p.map(c => c.id === cid ? u : c)); setEditingComment(null); setEditContent(''); setSilentEdit(false); } catch (e) {}
  }, [editContent, silentEdit]);
  const onCancelEdit = useCallback(() => { setEditingComment(null); setEditContent(''); setSilentEdit(false); }, []);
  const onReply = useCallback((c) => { setReplyTo(c); setNewComment(''); }, []);
  const onDelete = useCallback((cid) => setDeleteConfirm(cid), []);
  const onHardDelete = useCallback((cid) => setHardDeleteConfirm(cid), []);

  const softDel = async () => { if (!deleteConfirm) return; try { await api.deleteComment(deleteConfirm); setComments(p => p.map(c => c.id === deleteConfirm ? { ...c, deleted: 1, content: '' } : c)); } catch (e) {} setDeleteConfirm(null); };
  const hardDel = async () => {
    if (!hardDeleteConfirm) return;
    try { await api.hardDeleteComment(hardDeleteConfirm); const rm = new Set([hardDeleteConfirm]); const walk = pid => comments.filter(c => c.parent_id === pid).forEach(c => { rm.add(c.id); walk(c.id); }); walk(hardDeleteConfirm); setComments(p => p.filter(c => !rm.has(c.id))); } catch (e) {}
    setHardDeleteConfirm(null);
  };

  const tree = useMemo(() => {
    const m = {}; comments.forEach(c => { m[c.id] = { ...c, _replies: [] }; });
    const roots = [];
    comments.forEach(c => { if (c.parent_id && m[c.parent_id]) m[c.parent_id]._replies.push(m[c.id]); else roots.push(m[c.id]); });
    return roots;
  }, [comments]);

  if (loading) return <div className="p-6 sm:p-10 max-w-5xl mx-auto animate-fade-in"><div className="aspect-video bg-zinc-100 dark:bg-zinc-800 rounded-[32px] skeleton mb-6" /><div className="h-8 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton w-2/3 mb-4" /><div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton w-1/3" /></div>;
  if (error || !video) return <div className="p-6 sm:p-10 max-w-5xl mx-auto animate-scale-in"><div className="card p-16 text-center"><p className="text-red-500 font-bold text-lg mb-2">Błąd</p><p className="text-zinc-500">{error || 'Film nie znaleziony.'}</p><Link to="/" className="btn-primary mt-6 inline-block">Wróć</Link></div></div>;

  const src = activeSource === 'mirror1' ? { url: video.mirror1_url, type: video.mirror1_type } : activeSource === 'mirror2' ? { url: video.mirror2_url, type: video.mirror2_type } : { url: video.main_source, type: video.main_source_type };
  const isHtml = src.type === 'embed' || src.type === 'html';
  const embedUrl = isHtml ? null : youtubeToEmbed(src.url);
  const sources = [
    { key: 'main', label: video.main_source_title || 'Główne źródło' },
    ...(video.mirror1_url ? [{ key: 'mirror1', label: video.mirror1_name || 'Mirror 1' }] : []),
    ...(video.mirror2_url ? [{ key: 'mirror2', label: video.mirror2_name || 'Mirror 2' }] : []),
  ];
  const isDev = user?.role === 'dev';
  const activeCount = comments.filter(c => !c.deleted).length;

  // Animation class based on URL param
  const enterClass = exiting ? exitClass : slideFrom === 'right' ? 'anim-enter-right' : slideFrom === 'left' ? 'anim-enter-left' : 'anim-enter-up';

  return (
    <>
      <div className={`p-6 sm:p-10 max-w-5xl mx-auto ${enterClass}`}>
        <button onClick={() => navigate(fromCategory ? `/category/${fromCategory}` : '/')} className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white font-medium text-sm mb-6 hover:gap-3 transition-all active:scale-95">
          <ArrowLeft className="w-4 h-4" /> {fromCategory ? 'Wróć do kategorii' : 'Wróć do bazy'}
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6 anim-stagger-1">
          <div className="flex-1">
            <div className="flex items-start gap-3 mb-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white font-display flex-1">{video.title}</h1>
              {canEdit && <button onClick={openEditModal} className="shrink-0 p-2.5 rounded-xl bg-violet-50 dark:bg-violet-500/10 text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-all hover:scale-110 active:scale-95"><Pencil className="w-5 h-5" /></button>}
              <button onClick={toggleFav} disabled={favLoading} className={`shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl transition-all duration-300 hover:scale-105 active:scale-95 ${isFav ? 'bg-pink-50 dark:bg-pink-500/10 text-pink-500 shadow-lg shadow-pink-500/10' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-pink-500'}`}>
                <Heart className={`w-5 h-5 transition-all ${isFav ? 'fill-current scale-110' : ''}`} />
                {favCount > 0 && <span className="text-xs font-bold">{favCount}</span>}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link to={`/?author=${video.author_id}`} className="text-sm font-bold text-violet-500 hover:text-violet-600 transition-colors">{video.author_display_name || video.author_name}</Link>
              {video.tags?.length > 0 && <div className="flex flex-wrap gap-1.5">{video.tags.map(t => <Link key={t.id} to={`/?tags=${t.id}`} className="tag-chip hover:scale-105 active:scale-95">{t.name}</Link>)}</div>}
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400">
              <span>{formatDate(video.publish_date)}</span>
              {video.category_name && <><span>•</span><Link to={`/category/${video.category_slug}`} className="hover:text-violet-500 transition-colors">{video.category_name}</Link></>}
            </div>
          </div>
        </div>

        {/* Player — key forces remount on source switch */}
        <div className="mb-8 anim-stagger-2" key={`p-${activeSource}`}>
          {video.stream_video_id && video.stream_status === 'ready' && activeSource === 'main' ? (
            <SecurePlayer streamVideoId={video.stream_video_id} drmEnhanced={video.drm_enhanced} title={video.title} />
          ) : embedUrl ? (
            <div className="aspect-video rounded-[32px] overflow-hidden shadow-2xl animate-scale-in"><iframe src={embedUrl} className="w-full h-full" allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" /></div>
          ) : isHtml ? (
            <div className="aspect-video rounded-[32px] overflow-hidden animate-scale-in" dangerouslySetInnerHTML={{ __html: src.url }} />
          ) : <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 rounded-[32px] flex items-center justify-center"><p className="text-zinc-400 text-sm">Brak źródła.</p></div>}
        </div>

        {sources.length > 1 && (
          <div className="flex gap-2 mb-6 anim-stagger-3">
            {sources.map(s => <button key={s.key} onClick={() => setActiveSource(s.key)} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all hover:scale-105 active:scale-95 ${activeSource === s.key ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/30' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>{s.label}</button>)}
          </div>
        )}

        {(prevVideo || nextVideo) && (
          <div className="flex items-stretch gap-3 sm:gap-4 mb-8 anim-stagger-4">
            {prevVideo ? (
              <button onClick={() => goToVideo(prevVideo.id, 'prev')} disabled={exiting} className="flex-1 min-w-0 max-w-[50%] card p-4 sm:p-5 group hover:shadow-lg hover:-translate-y-1 text-left transition-all">
                <div className="flex items-center gap-1.5 text-violet-500 font-bold text-xs sm:text-sm mb-1"><ChevronLeft className="w-4 h-4 shrink-0 group-hover:-translate-x-1.5 transition-transform duration-300" /> poprzedni</div>
                <p className="text-xs sm:text-sm text-zinc-900 dark:text-white font-medium truncate group-hover:text-violet-500 transition-colors">{prevVideo.title}</p>
              </button>
            ) : <div className="flex-1" />}
            {nextVideo ? (
              <button onClick={() => goToVideo(nextVideo.id, 'next')} disabled={exiting} className="flex-1 min-w-0 max-w-[50%] card p-4 sm:p-5 text-right group hover:shadow-lg hover:-translate-y-1 ml-auto transition-all">
                <div className="flex items-center justify-end gap-1.5 text-violet-500 font-bold text-xs sm:text-sm mb-1">następny <ChevronRight className="w-4 h-4 shrink-0 group-hover:translate-x-1.5 transition-transform duration-300" /></div>
                <p className="text-xs sm:text-sm text-zinc-900 dark:text-white font-medium truncate group-hover:text-violet-500 transition-colors">{nextVideo.title}</p>
              </button>
            ) : <div className="flex-1" />}
          </div>
        )}

        {video.description && (
          <div className="card p-8 mb-6 anim-stagger-5"><h3 className="label-field">Opis</h3><div className="text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{video.description}</div></div>
        )}

        {/* Comments */}
        <div className="card p-8 anim-stagger-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2"><MessageCircle className="w-5 h-5 text-violet-500" /><h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display">Komentarze ({activeCount})</h3></div>
            {isDev && <button onClick={() => setDevOpen(!devOpen)} className="text-[10px] font-bold text-amber-500 bg-amber-50 dark:bg-amber-500/10 px-3 py-1.5 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-all">DEV: Dodaj jako...</button>}
          </div>
          {devOpen && isDev && (
            <div className="mb-6 p-4 bg-amber-50/50 dark:bg-amber-500/5 rounded-2xl border border-amber-200 dark:border-amber-500/20 space-y-3 animate-scale-in">
              <p className="text-xs font-bold text-amber-600 uppercase">Dodaj komentarz jako inny użytkownik</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <select value={devUserId} onChange={e => setDevUserId(e.target.value)} className="input-field !py-2 text-xs"><option value="">Użytkownik...</option>{allUsers.map(u => <option key={u.id} value={u.id}>{u.display_name || u.username}</option>)}</select>
                <input type="datetime-local" value={devDate} onChange={e => setDevDate(e.target.value)} className="input-field !py-2 text-xs" />
                <input type="text" value={devParent} onChange={e => setDevParent(e.target.value)} className="input-field !py-2 text-xs" placeholder="Parent ID" />
                <button onClick={submitDev} disabled={!devUserId || !devContent.trim()} className="btn-primary !py-2 text-xs">Dodaj</button>
              </div>
              <textarea value={devContent} onChange={e => setDevContent(e.target.value)} className="input-field !py-2 text-sm resize-none" rows={2} placeholder="Treść..." />
            </div>
          )}
          {replyTo && (
            <div className="flex items-center gap-2 mb-3 p-2 bg-violet-50 dark:bg-violet-500/10 rounded-xl text-sm animate-scale-in">
              <Reply className="w-4 h-4 text-violet-500" /><span className="text-violet-600 dark:text-violet-400">Odpowiedź do <strong>{replyTo.display_name || replyTo.username}</strong></span>
              <button onClick={() => setReplyTo(null)} className="ml-auto p-1 hover:bg-violet-100 dark:hover:bg-violet-500/20 rounded-lg"><X className="w-3.5 h-3.5 text-violet-500" /></button>
            </div>
          )}
          <div className="flex gap-3 mb-6">
            <img src={user?.avatar || `https://ui-avatars.com/api/?name=${user?.display_name || 'U'}&background=8b5cf6&color=fff&size=80`} alt="" className="w-10 h-10 rounded-xl shrink-0 object-cover" />
            <div className="flex-1 relative">
              <textarea value={newComment} onChange={e => setNewComment(e.target.value)} placeholder={replyTo ? 'Odpowiedz...' : 'Napisz komentarz...'} className="input-field !py-3 !pr-12 resize-none text-sm min-h-[48px] max-h-[120px]" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); }}} rows={1} />
              <button onClick={submitComment} disabled={!newComment.trim() || commentLoading} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-violet-500 hover:text-violet-600 disabled:text-zinc-300 dark:disabled:text-zinc-700 transition-all hover:scale-110 active:scale-90"><Send className="w-4 h-4" /></button>
            </div>
          </div>
          {tree.length === 0 ? <p className="text-sm text-zinc-400 text-center py-6">Brak komentarzy — bądź pierwszą osobą!</p> : (
            <div className="space-y-1">{tree.map(c => <CommentNode key={c.id} c={c} depth={0} replies={c._replies} user={user} editingId={editingComment} editContent={editContent} setEditContent={setEditContent} silentEdit={silentEdit} setSilentEdit={setSilentEdit} onStartEdit={onStartEdit} onSaveEdit={onSaveEdit} onCancelEdit={onCancelEdit} onReply={onReply} onDelete={onDelete} onHardDelete={onHardDelete} editHistoryId={editHistoryPopup} setEditHistoryId={setEditHistoryPopup} />)}</div>
          )}
        </div>
      </div>

      {/* ─── ALL MODALS via Portal — rendered in document.body, immune to CSS transform ─── */}

      {deleteConfirm && (
        <Portal>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }} onClick={() => setDeleteConfirm(null)} />
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[32px] shadow-2xl max-w-sm w-full p-8 text-center" style={{ position: 'relative', zIndex: 1, animation: 'modalIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)' }}>
              <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Usunąć komentarz?</h3>
              <p className="text-sm text-zinc-500 mb-6">Treść zostanie ukryta, wątek zachowany.</p>
              <div className="flex gap-3 justify-center"><button onClick={() => setDeleteConfirm(null)} className="btn-secondary text-sm">Anuluj</button><button onClick={softDel} className="btn-danger text-sm">Usuń</button></div>
            </div>
          </div>
        </Portal>
      )}

      {hardDeleteConfirm && (
        <Portal>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }} onClick={() => setHardDeleteConfirm(null)} />
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[32px] shadow-2xl max-w-sm w-full p-8 text-center" style={{ position: 'relative', zIndex: 1, animation: 'modalIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)' }}>
              <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Usunąć permanentnie?</h3>
              <p className="text-sm text-zinc-500 mb-6">Komentarz i wszystkie odpowiedzi zostaną usunięte na zawsze.</p>
              <div className="flex gap-3 justify-center"><button onClick={() => setHardDeleteConfirm(null)} className="btn-secondary text-sm">Anuluj</button><button onClick={hardDel} className="btn-danger text-sm">Usuń permanentnie</button></div>
            </div>
          </div>
        </Portal>
      )}

      {showEditModal && (
        <Portal>
          <VideoModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} video={video} users={editUsers} onSaved={() => { setShowEditModal(false); api.getVideo(id).then(v => setVideo(v)).catch(() => {}); }} />
        </Portal>
      )}
    </>
  );
}
