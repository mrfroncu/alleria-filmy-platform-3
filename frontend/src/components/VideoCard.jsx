import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import { formatDate } from '../utils/helpers';
import ProgressBar from './ui/ProgressBar';
import Badge from './ui/Badge';

export default function VideoCard({ video, progress, fromCategory }) {
  const progressPct = progress && progress.duration > 0 ? (progress.position / progress.duration) * 100 : null;
  const to = `/video/${video.id}${fromCategory ? `?from=${fromCategory}` : ''}`;

  return (
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <Link to={to} className="group block">
        <div className="relative aspect-video rounded-3xl overflow-hidden bg-slate-200 dark:bg-slate-800 mb-2.5">
          {video.thumbnail ? (
            <img
              src={video.thumbnail}
              alt={video.title}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              <Play className="w-8 h-8" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="w-11 h-11 rounded-full bg-white/90 flex items-center justify-center">
              <Play className="w-4.5 h-4.5 text-slate-900 ml-0.5" fill="currentColor" />
            </div>
          </div>
          {progressPct !== null && (
            <div className="absolute bottom-0 left-0 right-0">
              <ProgressBar value={progressPct} className="rounded-none h-1" trackClassName="bg-black/40" />
            </div>
          )}
        </div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 leading-snug group-hover:text-brand-500 transition-colors">
          {video.title}
        </h3>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="truncate">{video.author_display_name || video.author_name}</span>
          <span>·</span>
          <span className="shrink-0">{formatDate(video.publish_date)}</span>
        </div>
        {video.category_name && (
          <Badge tone="brand" className="mt-2">{video.category_name}</Badge>
        )}
      </Link>
    </motion.div>
  );
}
