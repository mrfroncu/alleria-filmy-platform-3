import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Film } from 'lucide-react';
import { api } from '../utils/apiClient';
import { useSettings } from '../contexts/SettingsContext';
import { formatDate } from '../utils/helpers';
import Avatar from '../components/ui/Avatar';
import Card from '../components/ui/Card';
import Skeleton from '../components/ui/Skeleton';
import VideoCard from '../components/VideoCard';

export default function AuthorPage() {
  const { authorId } = useParams();
  const { config } = useSettings();
  const [author, setAuthor] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [videos, setVideos] = useState(null);

  useEffect(() => {
    setAuthor(null);
    setNotFound(false);
    setVideos(null);
    api.getAuthor(authorId).then(setAuthor).catch(() => setNotFound(true));
    api.getVideos({ author: authorId }).then(setVideos).catch(() => setVideos([]));
  }, [authorId]);

  if (notFound) {
    return (
      <div className="p-6 sm:p-10 max-w-2xl mx-auto">
        <div className="rounded-4xl border border-dashed border-slate-300 dark:border-white/15 p-16 text-center">
          <p className="text-slate-500 dark:text-slate-400 font-medium">Autor nie znaleziony</p>
        </div>
      </div>
    );
  }

  if (!author) {
    return (
      <div className="p-6 sm:p-10 max-w-5xl mx-auto">
        <Skeleton className="h-40 rounded-4xl mb-6" />
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-10 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="p-8 mb-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 to-teal-500/10" />
          <div className="relative flex items-center gap-5">
            <Avatar src={author.avatar} name={author.display_name || author.username} size="xl" />
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white font-display">{author.display_name || author.username}</h1>
              <p className="text-sm text-slate-400 mt-0.5">
                {author.created_at && `Dołączył ${formatDate(author.created_at)} · `}
                {videos?.length ?? 0} filmów
              </p>
              {author.bio && <p className="text-sm text-slate-600 dark:text-slate-300 mt-3 whitespace-pre-wrap max-w-xl">{author.bio}</p>}
            </div>
          </div>
        </Card>
      </motion.div>

      <div className="flex items-center gap-2 mb-5">
        <Film className="w-4 h-4 text-brand-500" />
        <h2 className="font-bold text-slate-900 dark:text-white font-display text-sm">Filmy autora</h2>
      </div>

      {videos === null ? (
        <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${config.gridCardMinWidth}px, 1fr))` }}>
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-video rounded-3xl" />)}
        </div>
      ) : videos.length === 0 ? (
        <p className="text-sm text-slate-400">Brak filmów.</p>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${config.gridCardMinWidth}px, 1fr))` }}>
          {videos.map((v) => <VideoCard key={v.id} video={v} />)}
        </div>
      )}
    </div>
  );
}
