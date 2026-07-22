import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Film, Users, Eye, Tag, Trophy, TrendingUp, Heart, Play } from 'lucide-react';
import { api } from '../utils/api';
import { useSettings } from '../contexts/SettingsContext';

export default function StatsPage() {
  const { config } = useSettings();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getStats().then(setStats).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6 sm:p-10 max-w-7xl mx-auto page-enter">
        <div className="h-10 w-48 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton mb-10" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[1,2,3,4].map(i => <div key={i} className="card p-6"><div className="h-16 skeleton rounded-xl" /></div>)}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const StatCard = ({ icon: Icon, label, value, color, sub }) => (
    <div className="card p-6 group hover:shadow-lg transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-white font-display tracking-tight">{value}</p>
      <p className="text-xs text-zinc-500 font-medium mt-1">{label}</p>
      {sub && <p className="text-[10px] text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto page-enter">
      <div className="mb-10">
        {!config.showTopBar && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-violet-50 dark:bg-violet-500/10 rounded-xl flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-violet-500" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Statystyki</h1>
          </div>
        )}
        <p className="text-zinc-500 dark:text-zinc-400">Podsumowanie aktywności społeczności i Twoje osobiste statystyki.</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Film} label="Filmów w bazie" value={stats.totalVideos} color="bg-violet-50 dark:bg-violet-500/10 text-violet-500" />
        <StatCard icon={Users} label="Użytkowników" value={stats.totalUsers} color="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500" />
        <StatCard icon={Eye} label="Łącznie wyświetleń" value={stats.totalViews} color="bg-amber-50 dark:bg-amber-500/10 text-amber-500" />
        <StatCard icon={Tag} label="Tagów" value={stats.totalTags} color="bg-pink-50 dark:bg-pink-500/10 text-pink-500" />
      </div>

      {/* Personal Stats */}
      <div className="card p-6 mb-8">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-violet-500" /> Twoje statystyki
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-4 p-5 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl">
            <div className="w-11 h-11 rounded-xl bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center shrink-0">
              <Eye className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white font-display leading-tight">{stats.myStats.views}</p>
              <p className="text-xs text-zinc-500">Obejrzanych filmów</p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-5 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl">
            <div className="w-11 h-11 rounded-xl bg-pink-100 dark:bg-pink-500/15 flex items-center justify-center shrink-0">
              <Heart className="w-5 h-5 text-pink-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white font-display leading-tight">{stats.myStats.favorites}</p>
              <p className="text-xs text-zinc-500">Ulubionych</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Watched */}
        <div className="card p-6">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" /> Najczęściej oglądane
          </h2>
          {stats.mostWatched.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-6">Brak danych</p>
          ) : (
            <div className="space-y-2">
              {stats.mostWatched.map((v, idx) => (
                <Link key={v.id} to={`/video/${v.id}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors group">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                    idx === 0 ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300' :
                    idx === 1 ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300' :
                    idx === 2 ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300' :
                    'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                  }`}>{idx + 1}</span>
                  <div className="w-10 h-7 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0">
                    {v.thumbnail && <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate group-hover:text-violet-500 dark:group-hover:text-violet-400 transition-colors">{v.title}</p>
                    <p className="text-[10px] text-zinc-400">{v.author_display_name}</p>
                  </div>
                  <span className="text-xs font-bold text-zinc-400 shrink-0 flex items-center gap-1">
                    <Eye className="w-3 h-3" /> {v.views}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Top Viewers */}
        <div className="card p-6">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-4 flex items-center gap-2">
            <Play className="w-5 h-5 text-violet-500" /> Najbardziej aktywni
          </h2>
          {stats.topViewers.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-6">Brak danych</p>
          ) : (
            <div className="space-y-2">
              {stats.topViewers.map((u, idx) => (
                <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                    idx === 0 ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300' :
                    'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                  }`}>{idx + 1}</span>
                  <img src={u.avatar || `https://ui-avatars.com/api/?name=${u.display_name}&background=6366f1&color=fff&size=40`} alt="" className="w-8 h-8 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700" />
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white flex-1 truncate">{u.display_name}</span>
                  <span className="text-xs font-bold text-zinc-400 flex items-center gap-1"><Eye className="w-3 h-3" /> {u.total_views}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Authors */}
        <div className="card p-6">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-4 flex items-center gap-2">
            <Film className="w-5 h-5 text-emerald-500" /> Top autorzy
          </h2>
          {stats.topAuthors.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-6">Brak danych</p>
          ) : (
            <div className="space-y-2">
              {stats.topAuthors.map((a, idx) => (
                <Link key={a.id} to={`/author/${a.id}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors group">
                  <img src={a.avatar || `https://ui-avatars.com/api/?name=${a.display_name}&background=6366f1&color=fff&size=40`} alt="" className="w-8 h-8 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700" />
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white flex-1 truncate group-hover:text-violet-500 dark:group-hover:text-violet-400 transition-colors">{a.display_name}</span>
                  <span className="text-xs font-bold text-zinc-400">{a.video_count} filmów</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Tag Cloud */}
        <div className="card p-6">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-4 flex items-center gap-2">
            <Tag className="w-5 h-5 text-pink-500" /> Popularne tagi
          </h2>
          {stats.tagCloud.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-6">Brak tagów</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {stats.tagCloud.map((tag, idx) => {
                const size = idx < 3 ? 'text-sm px-4 py-2' : idx < 8 ? 'text-xs px-3 py-1.5' : 'text-[11px] px-2.5 py-1';
                return (
                  <Link
                    key={tag.id}
                    to={`/tag/${tag.id}`}
                    className={`inline-flex items-center gap-1.5 ${size} bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-300 rounded-xl font-bold border border-violet-100 dark:border-violet-500/20 hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-all`}
                  >
                    {tag.name}
                    <span className="text-violet-400 dark:text-violet-500 font-mono">{tag.count}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
