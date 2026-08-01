import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Trash2, Play } from 'lucide-react';
import { api } from '../utils/apiClient';
import { useSettings } from '../contexts/SettingsContext';
import { formatDate } from '../utils/helpers';
import Skeleton from '../components/ui/Skeleton';

export default function FavoritesPage() {
  const [videos, setVideos] = useState(null);
  const { config } = useSettings();

  useEffect(() => {
    api.getFavorites().then(setVideos).catch(() => setVideos([]));
  }, []);

  const remove = async (id) => {
    setVideos((v) => v.filter((x) => x.id !== id));
    try { await api.toggleFavorite(id, true); } catch (_) {}
  };

  return (
    <div className="p-6 sm:p-10">
      <div className="flex items-center gap-2.5 mb-6">
        <Heart className="w-5 h-5 text-rose-500" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-display">Ulubione</h1>
      </div>

      {videos === null ? (
        <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${config.gridCardMinWidth}px, 1fr))` }}>
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-video rounded-3xl" />)}
        </div>
      ) : videos.length === 0 ? (
        <div className="rounded-4xl border border-dashed border-slate-300 dark:border-white/15 p-16 text-center">
          <p className="text-slate-500 dark:text-slate-400 font-medium">Brak ulubionych filmów</p>
          <p className="text-sm text-slate-400 dark:text-slate-600 mt-1">Dodaj filmy do ulubionych klikając serduszko na stronie filmu.</p>
        </div>
      ) : (
        <motion.div layout className="grid gap-5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${config.gridCardMinWidth}px, 1fr))` }}>
          <AnimatePresence mode="popLayout">
            {videos.map((v) => (
              <motion.div key={v.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} className="group relative">
                <Link to={`/video/${v.id}`} className="block">
                  <div className="relative aspect-video rounded-3xl overflow-hidden bg-slate-200 dark:bg-slate-800 mb-2.5">
                    {v.thumbnail ? (
                      <img src={v.thumbnail} alt={v.title} loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400"><Play className="w-8 h-8" /></div>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 leading-snug group-hover:text-brand-500 transition-colors">{v.title}</h3>
                  <p className="text-xs text-slate-400 mt-1">{formatDate(v.publish_date)}</p>
                </Link>
                <button
                  onClick={(e) => { e.preventDefault(); remove(v.id); }}
                  className="absolute top-2.5 right-2.5 p-2 rounded-xl bg-black/50 text-white opacity-0 group-hover:opacity-100 hover:bg-rose-500 transition-all"
                  title="Usuń z ulubionych"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
