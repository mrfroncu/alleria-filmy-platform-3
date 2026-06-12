import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Film, Trash2 } from 'lucide-react';
import { api } from '../utils/api';
import { morph } from '../utils/fx';
import VideoCard from '../components/VideoCard';
import QuickLook from '../components/QuickLook';

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quickLook, setQuickLook] = useState(null);

  const openQuick = (video) => morph(() => setQuickLook(video));
  const closeQuick = () => morph(() => setQuickLook(null));

  useEffect(() => {
    api.getFavorites().then(setFavorites).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleRemove = async (e, videoId) => {
    e.preventDefault();
    e.stopPropagation();
    await api.removeFavorite(videoId);
    // Removal runs in a view transition: the tile shrinks away and the
    // remaining tiles GLIDE into the freed slot.
    morph(() => setFavorites(prev => prev.filter(v => v.id !== videoId)));
  };

  return (
    <div className="p-5 sm:px-10 sm:py-6 max-w-7xl mx-auto">
      <div className="mb-8 anim-stagger-1">
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
            <VideoCard
              key={video.id}
              video={video}
              layout="grid"
              onQuickLook={openQuick}
              morphHidden={quickLook?.id === video.id}
              delay={idx * 45}
              overlay={
                <button
                  onClick={(e) => handleRemove(e, video.id)}
                  className="absolute top-3 right-3 p-2 bg-black/50 hover:bg-red-600 rounded-full text-white transition-all duration-300 opacity-0 group-hover:opacity-100 hover:scale-110 hover:rotate-6 active:scale-90 z-10"
                  title="Usuń z ulubionych"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              }
            />
          ))}
        </div>
      )}

      {quickLook && (
        <QuickLook video={quickLook} onClose={closeQuick} />
      )}
    </div>
  );
}
