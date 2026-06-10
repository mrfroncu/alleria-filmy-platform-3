import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Film, Trash2 } from 'lucide-react';
import { api } from '../utils/api';
import { formatDateShort } from '../utils/helpers';

const armHeroMorph = (e) => {
  const thumb = e.currentTarget.querySelector('[data-vt-thumb]');
  if (thumb) thumb.style.viewTransitionName = 'video-hero';
};

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);

  const load = () => {
    setLoading(true);
    api.getFavorites().then(setFavorites).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleRemove = async (e, videoId) => {
    e.preventDefault();
    e.stopPropagation();
    setRemovingId(videoId);
    await api.removeFavorite(videoId);
    // Let the shrink-out animation play before the card leaves the list
    setTimeout(() => {
      setFavorites(prev => prev.filter(v => v.id !== videoId));
      setRemovingId(null);
    }, 280);
  };

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto">
      <div className="mb-10 anim-stagger-1">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 bg-curtain-50 dark:bg-curtain-500/10 border border-curtain-100 dark:border-curtain-500/20 rounded-2xl flex items-center justify-center animate-float">
            <Heart className="w-5 h-5 text-curtain-500 fill-curtain-500/30" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight font-display">
            <span className="text-gradient">Ulubione</span>
          </h1>
        </div>
        <p className="text-zinc-500 dark:text-zinc-400">Twoje zapisane filmy — szybki dostęp do ulubionych materiałów.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1,2,3].map(i => (
            <div key={i} className="card overflow-hidden">
              <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 skeleton" />
              <div className="p-6 space-y-3">
                <div className="h-5 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton w-3/4" />
                <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : favorites.length === 0 ? (
        <div className="card p-16 text-center animate-spring-in">
          <div className="w-20 h-20 bg-curtain-50 dark:bg-curtain-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 animate-float">
            <Heart className="w-10 h-10 text-curtain-300 dark:text-curtain-700" />
          </div>
          <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2 font-display">Brak ulubionych</h3>
          <p className="text-zinc-500 text-sm mb-6">Dodaj filmy do ulubionych klikając ikonę serca na stronie filmu.</p>
          <Link to="/" viewTransition className="btn-primary inline-flex items-center gap-2 text-sm">
            <Film className="w-4 h-4" /> Przeglądaj filmy
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 video-grid">
          {favorites.map((video, idx) => (
            <Link
              key={video.id}
              to={`/video/${video.id}`}
              viewTransition
              onClick={armHeroMorph}
              className={`video-card card overflow-hidden group ${removingId === video.id ? 'opacity-0 scale-75 blur-sm' : ''}`}
              style={{ animationDelay: `${idx * 45}ms`, transition: 'opacity 0.28s, transform 0.28s, filter 0.28s' }}
            >
              <div data-vt-thumb className="thumb-shine relative aspect-video bg-zinc-100 dark:bg-zinc-800 overflow-hidden rounded-t-3xl">
                {video.thumbnail ? (
                  <img src={video.thumbnail} alt={video.title} className="video-thumb w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Film className="w-12 h-12 text-zinc-300 dark:text-zinc-700" /></div>
                )}
                <button
                  onClick={(e) => handleRemove(e, video.id)}
                  className="absolute top-3 right-3 p-2 bg-black/50 hover:bg-red-600 rounded-full text-white transition-all duration-300 opacity-0 group-hover:opacity-100 hover:scale-110 hover:rotate-6 active:scale-90"
                  title="Usuń z ulubionych"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6">
                <h3 className="font-bold text-zinc-900 dark:text-white mb-2 line-clamp-2 group-hover:text-ember-500 dark:group-hover:text-ember-400 transition-colors font-display">{video.title}</h3>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500 font-medium">{video.author_display_name || video.author_name}</span>
                  <span className="text-xs text-zinc-400 font-mono">{formatDateShort(video.publish_date)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
