import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowLeft, Heart, Pencil, MessageCircle, Send, Trash2, Reply, Check, X, AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';
import { formatDate, youtubeToEmbed } from '../utils/helpers';
import { useAuth } from '../contexts/AuthContext';
import SecurePlayer from '../components/SecurePlayer';
import VideoModal from '../components/VideoModal';

export default function VideoPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const fromCategory = searchParams.get('from') || '';
  const navigate = useNavigate();
  const { user } = useAuth();

  // Determine initial animation from navigation state
  const slideFrom = location.state?.slideFrom || 'up';

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
  const [exitDir, setExitDir] = useState('');

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

  // Dev comment creation
  const [devCommentOpen, setDevCommentOpen] = useState(false);
  const [devCommentUserId, setDevCommentUserId] = useState('');
  const [devCommentContent, setDevCommentContent] = useState('');
  const [devCommentDate, setDevCommentDate] = useState('');
  const [devCommentParent, setDevCommentParent] = useState('');
  const [allUsers, setAllUsers] = useState([]);

  useEffect(() => {
    setLoading(true);
    setActiveSource('main');
    setPrevVideo(null);
    setNextVideo(null);
    const videoId = Number(id);

    Promise.all([
      api.getVideo(id),
      api.checkFavorite(id).catch(() => ({ isFavorite: false, count: 0 })),
    ]).then(([v, f]) => {
      setVideo(v);
      setIsFav(f.isFavorite);
      setFavCount(f.count || 0);
      setError(null);
      const isAdmin = user?.role === 'admin' || user?.role === 'dev';
      if (isAdmin) setCanEdit(true);
      else if (v.category_id) api.getCategories().then(cats => { setCanEdit(cats.find(c => c.id === v.category_id)?.canEdit || false); }).catch(() => setCanEdit(false));
      else setCanEdit(false);

      const listParams = fromCategory ? { category: fromCategory } : {};
      api.getVideos(listParams).then(vids => {
        if (!Array.isArray(vids) || !vids.length) return;
        const idx = vids.findIndex(vid => Number(vid.id) === videoId);
        if (idx > 0) setPrevVideo(vids[idx - 1]);
        if (idx >= 0 && idx < vids.length - 1) setNextVideo(vids[idx + 1]);
      }).catch(() => {});
      api.getComments(videoId).then(setComments).catch(() => setComments([]));
    }).catch(err => setError(err.message)).finally(() => setLoading(false));
  }, [id, fromCategory]);

  // Load all users for dev comment creation
  useEffect(() => {
    if (user?.role === 'dev' && devCommentOpen && allUsers.length === 0) {
      api.getAllUsers().then(setAllUsers).catch(() => {});
    }
  }, [devCommentOpen]);

  const goToVideo = (videoId, direction) => {
    if (exiting) return;
    setExiting(true);
    setExitDir(direction === 'next' ? 'exit-left' : 'exit-right');
    setTimeout(() => {
      navigate(`/video/${videoId}${fromCategory ? `?from=${fromCategory}` : ''}`, {
        state: { slideFrom: direction === 'next' ? 'right' : 'left' }
      });
    }, 300);
  };

  const toggleFav = async () => {
    setFavLoading(true);
    try {
      if (isFav) { await api.removeFavorite(id); setIsFav(false); setFavCount(c => Math.max(0, c - 1)); }
      else { await api.addFavorite(id); setIsFav(true); setFavCount(c => c + 1); }
    } catch (e) {}
    setFavLoading(false);
  };

  const openEditModal = async () => {
    try { setEditUsers(await api.getAllUsers()); } catch (e) { setEditUsers([]); }
    setShowEditModal(true);
  };

  const submitComment = async () => {
    if (!newComment.trim() || commentLoading) return;
    setCommentLoading(true);
    try {
      const c = await api.addComment(id, newComment.trim(), replyTo?.id || null);
      setComments(prev => [...prev, c]);
      setNewComment(''); setReplyTo(null);
    } catch (e) {}
    setCommentLoading(false);
  };

  const submitDevComment = async () => {
    if (!devCommentUserId || !devCommentContent.trim()) return;
    try {
      const c = await api.addAdminComment({
        video_id: Number(id), user_id: Number(devCommentUserId),
        content: devCommentContent.trim(),
        created_at: devCommentDate || undefined,
        parent_id: devCommentParent ? Number(devCommentParent) : null,
      });
      setComments(prev => [...prev, c]);
      setDevCommentContent(''); setDevCommentDate(''); setDevCommentParent('');
    } catch (e) {}
  };

  const startEdit = (c) => { setEditingComment(c.id); setEditContent(c.content); setSilentEdit(false); };

  const saveEdit = async (commentId) => {
    if (!editContent.trim()) return;
    try {
      const updated = await api.editComment(commentId, editContent.trim(), silentEdit);
      setComments(prev => prev.map(c => c.id === commentId ? updated : c));
      setEditingComment(null); setEditContent(''); setSilentEdit(false);
    } catch (e) {}
  };

  const softDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await api.deleteComment(deleteConfirm);
      setComments(prev => prev.map(c => c.id === deleteConfirm ? { ...c, deleted: 1, content: '' } : c));
    } catch (e) {}
    setDeleteConfirm(null);
  };

  const hardDelete = async () => {
    if (!hardDeleteConfirm) return;
    try {
      await api.hardDeleteComment(hardDeleteConfirm);
      // Remove comment and all its replies
      const toRemove = new Set([hardDeleteConfirm]);
      const findReplies = (pid) => { comments.filter(c => c.parent_id === pid).forEach(c => { toRemove.add(c.id); findReplies(c.id); }); };
      findReplies(hardDeleteConfirm);
      setComments(prev => prev.filter(c => !toRemove.has(c.id)));
    } catch (e) {}
    setHardDeleteConfirm(null);
  };

  if (loading) return (
    <div className="p-6 sm:p-10 max-w-5xl mx-auto animate-fade-in">
      <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 rounded-[32px] skeleton mb-6" />
      <div className="h-8 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton w-2/3 mb-4" />
      <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton w-1/3" />
    </div>
  );

  if (error || !video) return (
    <div className="p-6 sm:p-10 max-w-5xl mx-auto animate-scale-in">
      <div className="card p-16 text-center"><p className="text-red-500 font-bold text-lg mb-2">Błąd</p><p className="text-zinc-500">{error || 'Film nie znaleziony.'}</p>
        <Link to="/" className="btn-primary mt-6 inline-block">Wróć</Link></div>
    </div>
  );

  // Source logic — key forces iframe remount on switch
  const getSource = () => {
    if (activeSource === 'mirror1') return { url: video.mirror1_url, type: video.mirror1_type };
    if (activeSource === 'mirror2') return { url: video.mirror2_url, type: video.mirror2_type };
    return { url: video.main_source, type: video.main_source_type };
  };
  const { url: srcUrl, type: srcType } = getSource();
  const isEmbed = srcType === 'embed' || srcType === 'html';
  const embedUrl = isEmbed ? null : youtubeToEmbed(srcUrl);
  const embedHtml = isEmbed ? srcUrl : null;
  const sources = [
    { key: 'main', label: video.main_source_title || 'Główne źródło' },
    ...(video.mirror1_url ? [{ key: 'mirror1', label: video.mirror1_name || 'Mirror 1' }] : []),
    ...(video.mirror2_url ? [{ key: 'mirror2', label: video.mirror2_name || 'Mirror 2' }] : []),
  ];

  const topComments = comments.filter(c => !c.parent_id);
  const getReplies = (pid) => comments.filter(c => c.parent_id === pid);
  const replyCount = (pid) => { let n = 0; const walk = (p) => { comments.filter(c => c.parent_id === p).forEach(c => { n++; walk(c.id); }); }; walk(pid); return n; };
  const isDev = user?.role === 'dev';

  const CommentItem = ({ c, depth = 0 }) => {
    const replies = getReplies(c.id);
    const isEditing = editingComment === c.id;
    const canMod = c.user_id === user?.id || user?.role === 'admin' || isDev;
    let history = []; try { history = JSON.parse(c.edit_history || '[]'); } catch (e) {}
    const isDeleted = c.deleted === 1;

    return (
      <div className={`animate-slide-up ${depth > 0 ? 'ml-6 sm:ml-10 border-l-2 border-violet-200/50 dark:border-violet-800/30 pl-4' : ''}`}>
        <div className="flex gap-3 group py-2 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 -mx-2 px-2 rounded-xl transition-colors">
          <img src={c.avatar || `https://ui-avatars.com/api/?name=${c.display_name || c.username || 'U'}&background=8b5cf6&color=fff&size=80`} alt="" className={`w-8 h-8 rounded-xl shrink-0 object-cover mt-0.5 ${isDeleted ? 'opacity-40 grayscale' : ''}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className={`text-sm font-bold ${isDeleted ? 'text-zinc-400' : 'text-zinc-900 dark:text-white'}`}>{c.display_name || c.username}</span>
              <span className="text-[10px] text-zinc-400 font-mono">{formatDate(c.created_at)}</span>
              {c.edited === 1 && !isDeleted && <button onClick={() => setEditHistoryPopup(editHistoryPopup === c.id ? null : c.id)} className="text-[9px] text-zinc-400 hover:text-violet-500 transition-colors">(edytowano)</button>}
            </div>
            {isDeleted ? (
              <p className="text-sm text-zinc-400 italic">(komentarz usunięty)</p>
            ) : isEditing ? (
              <div className="space-y-2">
                <textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="input-field !py-2 !px-3 text-sm resize-none" rows={2} />
                <div className="flex items-center gap-2">
                  <button onClick={() => saveEdit(c.id)} className="p-1.5 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-all hover:scale-110"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setEditingComment(null)} className="p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all hover:scale-110"><X className="w-4 h-4" /></button>
                  {isDev && (
                    <label className="flex items-center gap-1.5 text-[10px] text-amber-500 cursor-pointer ml-2">
                      <input type="checkbox" checked={silentEdit} onChange={e => setSilentEdit(e.target.checked)} className="w-3 h-3 rounded" />
                      Ciche (bez śladu)
                    </label>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words">{c.content}</p>
            )}
            {editHistoryPopup === c.id && history.length > 0 && (
              <div className="mt-2 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 animate-scale-in">
                <p className="text-[10px] font-bold text-zinc-500 uppercase mb-2">Historia edycji</p>
                {history.map((h, i) => <div key={i} className="text-xs text-zinc-500 mb-1"><span className="font-mono text-[10px]">{formatDate(h.date)}</span>: {h.content}</div>)}
              </div>
            )}
            {!isEditing && !isDeleted && (
              <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-all">
                <button onClick={() => { setReplyTo(c); setNewComment(''); }} className="text-[11px] text-zinc-400 hover:text-violet-500 px-2 py-1 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-all flex items-center gap-1"><Reply className="w-3 h-3" /> Odpowiedz</button>
                {(c.user_id === user?.id || isDev) && <button onClick={() => startEdit(c)} className="text-[11px] text-zinc-400 hover:text-amber-500 px-2 py-1 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-all flex items-center gap-1"><Pencil className="w-3 h-3" /> Edytuj</button>}
                {canMod && <button onClick={() => setDeleteConfirm(c.id)} className="text-[11px] text-zinc-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-all flex items-center gap-1"><Trash2 className="w-3 h-3" /> Usuń</button>}
              </div>
            )}
            {isDeleted && isDev && (
              <button onClick={() => setHardDeleteConfirm(c.id)} className="text-[10px] text-red-400 hover:text-red-500 mt-1 transition-colors">Usuń całkowicie{replies.length > 0 ? ` (+ ${replyCount(c.id)} odpowiedzi)` : ''}</button>
            )}
          </div>
        </div>
        {replies.map(r => <CommentItem key={r.id} c={r} depth={depth + 1} />)}
      </div>
    );
  };

  const enterAnim = slideFrom === 'right' ? 'video-enter-right' : slideFrom === 'left' ? 'video-enter-left' : 'video-enter-up';
  const mainClass = exiting ? `video-${exitDir}` : enterAnim;

  return (
    <div className={`p-6 sm:p-10 max-w-5xl mx-auto ${mainClass}`}>
      <button onClick={() => navigate(fromCategory ? `/category/${fromCategory}` : '/')} className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white font-medium text-sm mb-6 hover:gap-3 transition-all active:scale-95">
        <ArrowLeft className="w-4 h-4" /> {fromCategory ? 'Wróć do kategorii' : 'Wróć do bazy'}
      </button>

      <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6 anim-stagger-1">
        <div className="flex-1">
          <div className="flex items-start gap-3 mb-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white font-display flex-1">{video.title}</h1>
            {canEdit && <button onClick={openEditModal} className="shrink-0 p-2.5 rounded-xl bg-violet-50 dark:bg-violet-500/10 text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-all hover:scale-110 active:scale-95" title="Edytuj"><Pencil className="w-5 h-5" /></button>}
            <button onClick={toggleFav} disabled={favLoading} className={`shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl transition-all duration-300 hover:scale-105 active:scale-95 ${isFav ? 'bg-pink-50 dark:bg-pink-500/10 text-pink-500 shadow-lg shadow-pink-500/10' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-pink-500'}`}>
              <Heart className={`w-5 h-5 transition-all ${isFav ? 'fill-current scale-110' : ''}`} />
              {favCount > 0 && <span className="text-xs font-bold">{favCount}</span>}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold text-violet-500">{video.author_display_name || video.author_name}</span>
            {video.tags?.length > 0 && <div className="flex flex-wrap gap-1.5">{video.tags.map(t => <span key={t.id} className="tag-chip">{t.name}</span>)}</div>}
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400">
            <span>{formatDate(video.publish_date)}</span>
            {video.category_name && <><span>•</span><Link to={`/category/${video.category_slug}`} className="hover:text-violet-500 transition-colors">{video.category_name}</Link></>}
          </div>
        </div>
      </div>

      {/* Player — key forces remount on source switch */}
      <div className="mb-8 anim-stagger-2">
        {video.stream_video_id && video.stream_status === 'ready' ? (
          <SecurePlayer streamVideoId={video.stream_video_id} drmEnhanced={video.drm_enhanced} title={video.title} />
        ) : embedUrl ? (
          <div key={activeSource} className="aspect-video rounded-[32px] overflow-hidden shadow-2xl animate-scale-in">
            <iframe src={embedUrl} className="w-full h-full" allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
          </div>
        ) : embedHtml ? (
          <div key={activeSource} className="aspect-video rounded-[32px] overflow-hidden animate-scale-in" dangerouslySetInnerHTML={{ __html: embedHtml }} />
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
        <div className="card p-8 mb-6 anim-stagger-5">
          <h3 className="label-field">Opis</h3>
          <div className="text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{video.description}</div>
        </div>
      )}

      {/* Comments */}
      <div className="card p-8 anim-stagger-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2"><MessageCircle className="w-5 h-5 text-violet-500" /><h3 className="text-lg font-bold text-zinc-900 dark:text-white font-display">Komentarze ({comments.filter(c => !c.deleted).length})</h3></div>
          {isDev && <button onClick={() => setDevCommentOpen(!devCommentOpen)} className="text-[10px] font-bold text-amber-500 bg-amber-50 dark:bg-amber-500/10 px-3 py-1.5 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-all">DEV: Dodaj jako...</button>}
        </div>

        {/* Dev comment creation */}
        {devCommentOpen && isDev && (
          <div className="mb-6 p-4 bg-amber-50/50 dark:bg-amber-500/5 rounded-2xl border border-amber-200 dark:border-amber-500/20 space-y-3 animate-scale-in">
            <p className="text-xs font-bold text-amber-600 uppercase">Dodaj komentarz jako inny użytkownik</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <select value={devCommentUserId} onChange={e => setDevCommentUserId(e.target.value)} className="input-field !py-2 text-xs">
                <option value="">Użytkownik...</option>
                {allUsers.map(u => <option key={u.id} value={u.id}>{u.display_name || u.username}</option>)}
              </select>
              <input type="datetime-local" value={devCommentDate} onChange={e => setDevCommentDate(e.target.value)} className="input-field !py-2 text-xs" placeholder="Data" />
              <input type="text" value={devCommentParent} onChange={e => setDevCommentParent(e.target.value)} className="input-field !py-2 text-xs" placeholder="Parent ID (opcja)" />
              <button onClick={submitDevComment} disabled={!devCommentUserId || !devCommentContent.trim()} className="btn-primary !py-2 text-xs">Dodaj</button>
            </div>
            <textarea value={devCommentContent} onChange={e => setDevCommentContent(e.target.value)} className="input-field !py-2 text-sm resize-none" rows={2} placeholder="Treść komentarza..." />
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

        {topComments.length === 0 ? <p className="text-sm text-zinc-400 text-center py-6">Brak komentarzy — bądź pierwszą osobą!</p> : (
          <div className="space-y-1">{topComments.map(c => <CommentItem key={c.id} c={c} />)}</div>
        )}
      </div>

      {/* Soft delete confirmation — fixed center */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 dark:bg-zinc-950/70 backdrop-blur-md" onClick={() => setDeleteConfirm(null)} style={{ animation: 'fadeIn 0.2s ease-out' }} />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[32px] shadow-2xl max-w-sm w-full p-8 text-center" style={{ animation: 'modalIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-4" /><h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Usunąć komentarz?</h3>
            <p className="text-sm text-zinc-500 mb-6">Treść zostanie ukryta, ale wątek zachowany.</p>
            <div className="flex gap-3 justify-center"><button onClick={() => setDeleteConfirm(null)} className="btn-secondary text-sm">Anuluj</button><button onClick={softDelete} className="btn-danger text-sm">Usuń</button></div>
          </div>
        </div>
      )}

      {/* Hard delete confirmation (dev) — fixed center */}
      {hardDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 dark:bg-zinc-950/70 backdrop-blur-md" onClick={() => setHardDeleteConfirm(null)} style={{ animation: 'fadeIn 0.2s ease-out' }} />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[32px] shadow-2xl max-w-sm w-full p-8 text-center" style={{ animation: 'modalIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" /><h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Usunąć całkowicie?</h3>
            <p className="text-sm text-zinc-500 mb-6">Komentarz i {replyCount(hardDeleteConfirm)} odpowiedzi zostaną permanentnie usunięte.</p>
            <div className="flex gap-3 justify-center"><button onClick={() => setHardDeleteConfirm(null)} className="btn-secondary text-sm">Anuluj</button><button onClick={hardDelete} className="btn-danger text-sm">Usuń permanentnie</button></div>
          </div>
        </div>
      )}

      <VideoModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} video={showEditModal ? video : null} users={editUsers} onSaved={() => { setShowEditModal(false); api.getVideo(id).then(v => setVideo(v)).catch(() => {}); }} />
    </div>
  );
}
