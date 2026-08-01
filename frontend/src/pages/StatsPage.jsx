import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Library, Eye, Heart, TrendingUp, Users, Award } from 'lucide-react';
import { api } from '../utils/apiClient';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import ProgressBar from '../components/ui/ProgressBar';
import Skeleton from '../components/ui/Skeleton';

const MEDAL = ['text-amber-400', 'text-slate-400', 'text-amber-700'];

function RankingCard({ icon: Icon, title, items, labelKey, valueKey, avatarKey }) {
  const max = items.length ? Math.max(...items.map((i) => i[valueKey] || 0), 1) : 1;
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4.5 h-4.5 text-brand-500" />
        <h3 className="font-bold text-slate-900 dark:text-white font-display text-sm">{title}</h3>
      </div>
      {!items.length ? (
        <p className="text-xs text-slate-400">Brak danych.</p>
      ) : (
        <div className="space-y-3.5">
          {items.slice(0, 5).map((item, i) => (
            <div key={item.id ?? i}>
              <div className="flex items-center gap-2 mb-1">
                {i < 3 ? <Award className={`w-3.5 h-3.5 shrink-0 ${MEDAL[i]}`} /> : <span className="w-3.5 text-center text-[10px] text-slate-400 shrink-0">{i + 1}</span>}
                {avatarKey && <Avatar src={item[avatarKey]} name={item[labelKey]} size="sm" className="!w-5 !h-5 !rounded-lg !text-[10px]" />}
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate flex-1">{item[labelKey]}</span>
                <span className="text-xs font-bold text-slate-400 shrink-0">{item[valueKey]}</span>
              </div>
              <ProgressBar value={((item[valueKey] || 0) / max) * 100} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function StatsPage() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.getStats().then(setStats).catch(() => setStats({}));
  }, []);

  if (!stats) {
    return (
      <div className="p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-4xl" />)}
      </div>
    );
  }

  const topVideos = stats.topVideos || stats.mostWatched || [];
  const topViewers = stats.topViewers || stats.mostActive || [];
  const topAuthors = stats.topAuthors || [];
  const popularTags = stats.popularTags || [];

  return (
    <div className="p-6 sm:p-10 space-y-5">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-display mb-2">Statystyki</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-2">
          <Card className="p-8 h-full bg-gradient-to-br from-brand-500 to-teal-500 border-0">
            <Library className="w-7 h-7 text-white/80 mb-4" />
            <p className="text-5xl font-extrabold text-white font-display">{stats.totalVideos ?? '—'}</p>
            <p className="text-white/70 text-sm mt-1">filmów w bibliotece</p>
          </Card>
        </motion.div>
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-5">
          <Card className="p-5 flex items-center gap-3">
            <Eye className="w-5 h-5 text-brand-500 shrink-0" />
            <div>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{stats.myViews ?? 0}</p>
              <p className="text-xs text-slate-400">Twoje wyświetlenia</p>
            </div>
          </Card>
          <Card className="p-5 flex items-center gap-3">
            <Heart className="w-5 h-5 text-rose-500 shrink-0" />
            <div>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{stats.myFavorites ?? 0}</p>
              <p className="text-xs text-slate-400">Ulubione</p>
            </div>
          </Card>
        </div>
      </div>

      {popularTags.length > 0 && (
        <Card className="p-6">
          <h3 className="font-bold text-slate-900 dark:text-white font-display text-sm mb-3">Popularne tagi</h3>
          <div className="flex flex-wrap gap-2">
            {popularTags.map((t) => (
              <span key={t.id} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300">
                {t.name} <span className="text-slate-400">· {t.count}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <RankingCard icon={TrendingUp} title="Najczęściej oglądane" items={topVideos} labelKey="title" valueKey="views" />
        <RankingCard icon={Users} title="Najbardziej aktywni" items={topViewers} labelKey="display_name" valueKey="count" avatarKey="avatar" />
        <RankingCard icon={Award} title="Top autorzy" items={topAuthors} labelKey="display_name" valueKey="videoCount" avatarKey="avatar" />
      </div>
    </div>
  );
}
