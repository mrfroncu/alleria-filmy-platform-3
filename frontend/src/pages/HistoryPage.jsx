import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { History as HistoryIcon, Play } from 'lucide-react';
import { api } from '../utils/apiClient';
import { formatDayHeader, formatTime, groupByDay } from '../utils/helpers';
import Skeleton from '../components/ui/Skeleton';

export default function HistoryPage() {
  const [entries, setEntries] = useState(null);

  useEffect(() => {
    api.getHistory().then(setEntries).catch(() => setEntries([]));
  }, []);

  const dateField = entries?.[0]?.watched_at ? 'watched_at' : 'created_at';
  const groups = entries ? groupByDay(entries, dateField) : [];

  return (
    <div className="p-6 sm:p-10 max-w-3xl mx-auto">
      <div className="flex items-center gap-2.5 mb-6">
        <HistoryIcon className="w-5 h-5 text-brand-500" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-display">Historia oglądania</h1>
      </div>

      {entries === null ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-3xl" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-4xl border border-dashed border-slate-300 dark:border-white/15 p-16 text-center">
          <p className="text-slate-500 dark:text-slate-400 font-medium">Brak historii oglądania</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group.key}>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 font-display mb-3">
                {formatDayHeader(group.date)}
              </p>
              <div className="space-y-2">
                {group.items.map((entry, i) => (
                  <motion.div key={entry.id ?? `${group.key}-${i}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}>
                    <Link
                      to={`/video/${entry.video_id ?? entry.id}`}
                      className="group flex items-center gap-4 p-3 rounded-3xl hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    >
                      <div className="relative w-32 aspect-video rounded-2xl overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0">
                        {entry.thumbnail ? (
                          <img src={entry.thumbnail} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400"><Play className="w-5 h-5" /></div>
                        )}
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Play className="w-5 h-5 text-white" fill="white" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate group-hover:text-brand-500 transition-colors">{entry.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{entry.author_display_name || entry.author_name}</p>
                      </div>
                      <span className="text-xs text-slate-400 shrink-0 font-mono">{formatTime(entry[dateField])}</span>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
