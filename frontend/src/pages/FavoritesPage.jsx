import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Film, Trash2 } from 'lucide-react';
import { api } from '../utils/api';
import { formatDateShort } from '../utils/helpers';
import { useSettings } from '../contexts/SettingsContext';

export default function FavoritesPage() {
  const { config } = useSettings();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.getFavorites().then(setFavorites).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleRemove = async (e, videoId) => {
    e.preventDefault();
    e.stopPropagation();
    await api.removeFavorite(videoId);
    setFavorites(prev => prev.filter(v => v.id !== videoId));
  };

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto page-enter">
      <div className="mb-10">
        {!config.showTopBar && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-pink-50 dark:bg-pink-500/10 rounded-xl flex items-center justify-center">
              <Heart className="w-5 h-5 text-pink-500" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Ulubione</h1>
          </div>
        )}
        <p className="text-zinc-500 dark:text-zinc-400">Twoje zapisane filmy - szybki dostęp do ulubionych materiałów.</p>
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
        <div className="card p-16 text-center">
          <div className="w-20 h-20 bg-pink-50 dark:bg-pink-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Heart className="w-10 h-10 text-pink-300 dark:text-pink-700" />
          </div>
          <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2 font-display">Brak ulubionych</h3>
          <p className="text-zinc-500 text-sm mb-6">Dodaj filmy do ulubionych klikając ikonę serca na stronie filmu.</p>
          <Link to="/" className="btn-primary inline-flex items-center gap-2 text-sm">
            <Film className="w-4 h-4" /> Przeglądaj filmy
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {favorites.map((video, idx) => (
            <Link
              key={video.id}
              to={`/video/${video.id}`}
              className="card overflow-hidden group hover:shadow-2xl hover:shadow-violet-500/10 dark:hover:shadow-violet-500/5 transition-all duration-500 hover:-translate-y-1 relative"
            >
              <div className="relative aspect-video bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                {video.thumbnail ? (
                  <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Film className="w-12 h-12 text-zinc-300 dark:text-zinc-700" /></div>
                )}
                <button
                  onClick={(e) => handleRemove(e, video.id)}
                  className="absolute top-3 right-3 p-2 bg-black/50 hover:bg-red-600 rounded-xl text-white transition-all opacity-0 group-hover:opacity-100"
                  title="Usuń z ulubionych"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6">
                <h3 className="font-bold text-zinc-900 dark:text-white mb-2 line-clamp-2 group-hover:text-violet-500 dark:group-hover:text-violet-400 transition-colors">{video.title}</h3>
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
