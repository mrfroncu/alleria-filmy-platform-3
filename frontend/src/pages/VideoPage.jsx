import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowLeft, Film, Heart, Pencil } from 'lucide-react';
import { api } from '../utils/api';
import { formatDate, youtubeToEmbed } from '../utils/helpers';
import { useAuth } from '../contexts/AuthContext';
import SecurePlayer from '../components/SecurePlayer';
import VideoModal from '../components/VideoModal';

export default function VideoPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fromCategory = searchParams.get('from') || '';
  const navigate = useNavigate();
  const { user } = useAuth();
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSource, setActiveSource] = useState('main');
  const [error, setError] = useState(null);
  const [isFav, setIsFav] = useState(false);
  const [favLoading, setFavLoading] = useState(false);
  const [prevVideo, setPrevVideo] = useState(null);
  const [nextVideo, setNextVideo] = useState(null);
  const [fadeKey, setFadeKey] = useState(0);
  const [canEdit, setCanEdit] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editUsers, setEditUsers] = useState([]);

  const openEditModal = async () => {
    try {
      const users = await api.getAllUsers();
      setEditUsers(users);
    } catch (e) { setEditUsers([]); }
    setShowEditModal(true);
  }; // triggers re-animation on video change

  useEffect(() => {
    setLoading(true);
    setActiveSource('main');
    setPrevVideo(null);
    setNextVideo(null);
    setFadeKey(k => k + 1); // trigger fade-in animation

    const videoId = Number(id);

    // Load video + favorites first
    Promise.all([
      api.getVideo(id),
      api.checkFavorite(id).catch(() => ({ isFavorite: false })),
    ]).then(([v, f]) => {
      setVideo(v);
      setIsFav(f.isFavorite);
      setError(null);

      // Check edit permissions: admin/dev always can, editors if category matches
      const isAdmin = user?.role === 'admin' || user?.role === 'dev';
      if (isAdmin) {
        setCanEdit(true);
      } else if (v.category_id) {
        api.getCategories().then(cats => {
          const cat = cats.find(c => c.id === v.category_id);
          setCanEdit(cat?.canEdit || false);
        }).catch(() => setCanEdit(false));
      } else {
        setCanEdit(false);
      }

      // Then load context list for prev/next (non-blocking)
      const listParams = fromCategory ? { category: fromCategory } : {};
      api.getVideos(listParams).then(allVideos => {
        if (!Array.isArray(allVideos) || allVideos.length === 0) return;
        const idx = allVideos.findIndex(vid => Number(vid.id) === videoId);
        if (idx > 0) setPrevVideo(allVideos[idx - 1]);
        if (idx >= 0 && idx < allVideos.length - 1) setNextVideo(allVideos[idx + 1]);
      }).catch(() => {}); // Don't fail if list loading fails
    }).catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, fromCategory]);

  const toggleFav = async () => {
    setFavLoading(true);
    try {
      if (isFav) { await api.removeFavorite(id); setIsFav(false); }
      else { await api.addFavorite(id); setIsFav(true); }
    } catch (e) { console.error(e); }
    setFavLoading(false);
  };

  if (loading) {
    return (
      <div className="p-6 sm:p-10 max-w-5xl mx-auto animate-fade-in">
        <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 rounded-[32px] skeleton mb-6" />
        <div className="h-8 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton w-2/3 mb-4" />
        <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton w-1/3" />
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="p-10 max-w-5xl mx-auto text-center">
        <div className="card p-16">
          <Film className="w-16 h-16 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white font-display mb-2">Film nie znaleziony</h2>
          <p className="text-zinc-500 mb-6">{error || 'Nie znaleziono filmu o podanym ID.'}</p>
          <Link to={fromCategory ? `/category/${fromCategory}` : '/'} className="btn-primary inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> {fromCategory ? 'Wróć do kategorii' : 'Wróć do bazy'}
          </Link>
        </div>
      </div>
    );
  }

  const getEmbedHtml = () => {
    let source = video.main_source;
    let type = video.main_source_type || 'youtube';
    
    if (activeSource === 'mirror1' && video.mirror1_url) {
      source = video.mirror1_url;
      type = video.mirror1_is_embed ? 'embed' : 'youtube';
    } else if (activeSource === 'mirror2' && video.mirror2_url) {
      source = video.mirror2_url;
      type = video.mirror2_is_embed ? 'embed' : 'youtube';
    }

    if (type === 'embed' || type === 'html') {
      return { __html: source };
    }
    return null;
  };

  const getEmbedUrl = () => {
    let source = video.main_source;
    let type = video.main_source_type || 'youtube';

    if (activeSource === 'mirror1' && video.mirror1_url) {
      source = video.mirror1_url;
      type = video.mirror1_is_embed ? 'embed' : 'youtube';
    } else if (activeSource === 'mirror2' && video.mirror2_url) {
      source = video.mirror2_url;
      type = video.mirror2_is_embed ? 'embed' : 'youtube';
    }

    if (type === 'embed' || type === 'html') return null;
    return youtubeToEmbed(source);
  };

  const embedUrl = getEmbedUrl();
  const embedHtml = getEmbedHtml();
  const hasMirrors = video.mirror1_url || video.mirror2_url;
  const isSelfHosted = !!video.stream_video_id;

  const sources = [
    { key: 'main', label: video.main_source_title || 'Główne źródło' },
    ...(video.mirror1_url ? [{ key: 'mirror1', label: video.mirror1_name || 'Mirror 1' }] : []),
    ...(video.mirror2_url ? [{ key: 'mirror2', label: video.mirror2_name || 'Mirror 2' }] : []),
  ];

  return (
    <div key={fadeKey} className="p-6 sm:p-10 max-w-5xl mx-auto" style={{ animation: 'videoFadeIn 0.35s ease-out' }}>
      <style>{`@keyframes videoFadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      {/* Back button only — prev/next at bottom */}
      <button
        onClick={() => navigate(fromCategory ? `/category/${fromCategory}` : '/')}
        className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors font-medium text-sm mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> {fromCategory ? 'Wróć do kategorii' : 'Wróć do bazy'}
      </button>

      {/* Title & Meta */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="flex-1">
          <div className="flex items-start gap-3 mb-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white font-display flex-1">
              {video.title}
            </h1>
            {canEdit && (
              <button
                onClick={() => openEditModal()}
                className="shrink-0 p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-all duration-300"
                title="Edytuj film"
              >
                <Pencil className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={toggleFav}
              disabled={favLoading}
              className={`shrink-0 p-2.5 rounded-xl transition-all duration-300 ${
                isFav
                  ? 'bg-pink-50 dark:bg-pink-500/10 text-pink-500 hover:bg-pink-100 dark:hover:bg-pink-500/20 shadow-lg shadow-pink-500/10'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-500/10'
              }`}
              title={isFav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
            >
              <Heart className={`w-5 h-5 transition-all ${isFav ? 'fill-current scale-110' : ''}`} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={`/author/${video.author_id}`}
              className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 transition-colors"
            >
              {video.author_display_name || video.author_name}
            </Link>
            {video.tags && video.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {video.tags.map(tag => (
                  <Link
                    key={tag.id}
                    to={`/tag/${tag.id}`}
                    className="tag-chip"
                  >
                    {tag.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className="text-sm text-zinc-400 font-mono">{formatDate(video.publish_date)}</span>
        </div>
      </div>

      {/* Video Player */}
      {isSelfHosted && activeSource === 'main' ? (
        <div className="mb-6">
          <SecurePlayer
            streamVideoId={video.stream_video_id}
            drmEnhanced={!!video.drm_enhanced}
            title={video.title}
          />
        </div>
      ) : (
        <div className="card overflow-hidden mb-6">
          <div className="aspect-video bg-black relative">
            {embedUrl ? (
              <iframe
                key={activeSource}
                src={embedUrl}
                title={video.title}
                className="absolute inset-0 w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                frameBorder="0"
              />
            ) : embedHtml ? (
              <div
                key={activeSource}
                className="absolute inset-0 w-full h-full [&>iframe]:w-full [&>iframe]:h-full"
                dangerouslySetInnerHTML={embedHtml}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Film className="w-16 h-16 text-zinc-700" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Source Selection */}
      {hasMirrors && (
        <div className="mb-6">
          <span className="label-field">Źródło</span>
          <div className="flex flex-wrap gap-2">
            {sources.map(s => (
              <button
                key={s.key}
                onClick={() => setActiveSource(s.key)}
                className={`px-5 py-3 rounded-2xl font-bold text-sm transition-all ${
                  activeSource === s.key
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Prev / Next Navigation — context-aware (within category or all) */}
      {(prevVideo || nextVideo) && (
        <div className="flex items-stretch gap-3 sm:gap-4 mb-8">
          {prevVideo ? (
            <Link
              to={`/video/${prevVideo.id}${fromCategory ? `?from=${fromCategory}` : ''}`}
              className="flex-1 min-w-0 max-w-[50%] card p-4 sm:p-5 group hover:shadow-lg transition-all hover:-translate-y-0.5"
            >
              <div className="flex items-center gap-1.5 text-indigo-500 font-bold text-xs sm:text-sm mb-1">
                <ChevronLeft className="w-4 h-4 shrink-0" /> <span className="truncate">poprzedni</span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-900 dark:text-white font-medium truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {prevVideo.title}
              </p>
            </Link>
          ) : <div className="flex-1" />}
          
          {nextVideo ? (
            <Link
              to={`/video/${nextVideo.id}${fromCategory ? `?from=${fromCategory}` : ''}`}
              className="flex-1 min-w-0 max-w-[50%] card p-4 sm:p-5 text-right group hover:shadow-lg transition-all hover:-translate-y-0.5 ml-auto"
            >
              <div className="flex items-center justify-end gap-1.5 text-indigo-500 font-bold text-xs sm:text-sm mb-1">
                <span className="truncate">następny</span> <ChevronRight className="w-4 h-4 shrink-0" />
              </div>
              <p className="text-xs sm:text-sm text-zinc-900 dark:text-white font-medium truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {nextVideo.title}
              </p>
            </Link>
          ) : <div className="flex-1" />}
        </div>
      )}

      {/* Description */}
      {video.description && (
        <div className="card p-8">
          <h3 className="label-field">Opis</h3>
          <div className="text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
            {video.description}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      <VideoModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        video={showEditModal ? video : null}
        users={editUsers}
        onSaved={() => {
          setShowEditModal(false);
          api.getVideo(id).then(v => setVideo(v)).catch(() => {});
        }}
      />
    </div>
  );
}
