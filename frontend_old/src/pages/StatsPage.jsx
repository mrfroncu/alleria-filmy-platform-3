import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Film, Users, Eye, Tag, Trophy, TrendingUp, Play } from 'lucide-react';
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

  const rankBadgeClass = (idx) =>
    idx === 0 ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300' :
    idx === 1 ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300' :
    idx === 2 ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300' :
    'bg-zinc-100 dark:bg-zinc-800 text-zinc-500';

  const ProgressBar = ({ value, max, indent }) => (
    <div className={`h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden ${indent}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
        style={{ width: `${max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 4}%` }}
      />
    </div>
  );

  const maxWatched = stats.mostWatched[0]?.views || 0;
  const maxViewer = stats.topViewers[0]?.total_views || 0;
  const maxAuthor = stats.topAuthors[0]?.video_count || 0;

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto page-enter">
      <div className="mb-8">
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

      {/* Hero row: Biblioteka + osobiste statystyki */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Biblioteka — hero card */}
        <div className="card p-8 lg:col-span-2 relative overflow-hidden">
          <Film className="absolute -bottom-8 -right-8 w-48 h-48 text-violet-500/[0.05] rotate-12 pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
                <Film className="w-4.5 h-4.5 text-violet-500" />
              </div>
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Biblioteka</span>
            </div>
            <p className="text-6xl sm:text-7xl font-black font-display tracking-tight bg-gradient-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-transparent leading-none">
              {stats.totalVideos}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-3">filmów w bazie społeczności</p>
            <div className="grid grid-cols-3 gap-4 mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800">
              <div>
                <p className="text-xl font-bold text-zinc-900 dark:text-white font-display">{stats.totalViews}</p>
                <p className="text-[10px] text-zinc-500 font-medium mt-0.5">wyświetleń</p>
              </div>
              <div>
                <p className="text-xl font-bold text-zinc-900 dark:text-white font-display">{stats.totalUsers}</p>
                <p className="text-[10px] text-zinc-500 font-medium mt-0.5">użytkowników</p>
              </div>
              <div>
                <p className="text-xl font-bold text-zinc-900 dark:text-white font-display">{stats.totalTags}</p>
                <p className="text-[10px] text-zinc-500 font-medium mt-0.5">tagów</p>
              </div>
            </div>
          </div>
        </div>

        {/* Personal stats — stacked */}
        <div className="grid grid-rows-2 gap-4">
          <div className="card p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center shrink-0">
              <Eye className="w-6 h-6 text-violet-500" />
            </div>
            <div className="min-w-0">
              <p className="text-3xl font-bold text-zinc-900 dark:text-white font-display leading-tight">{stats.myStats.views}</p>
              <p className="text-xs text-zinc-500 font-medium">Twoje obejrzane</p>
            </div>
          </div>
          <div className="card p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-pink-100 dark:bg-pink-500/15 flex items-center justify-center shrink-0">
              <TrendingUp className="w-6 h-6 text-pink-500" />
            </div>
            <div className="min-w-0">
              <p className="text-3xl font-bold text-zinc-900 dark:text-white font-display leading-tight">{stats.myStats.favorites}</p>
              <p className="text-xs text-zinc-500 font-medium">Twoje ulubione</p>
            </div>
          </div>
        </div>
      </div>

      {/* Popularne tagi */}
      <div className="card p-6 mb-4">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-4 flex items-center gap-2 uppercase tracking-wider">
          <Tag className="w-4 h-4 text-pink-500" /> Popularne tagi
        </h2>
        {stats.tagCloud.length === 0 ? (
          <p className="text-sm text-zinc-400 text-center py-6">Brak tagów</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {stats.tagCloud.map(tag => (
              <Link
                key={tag.id}
                to={`/tag/${tag.id}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-300 rounded-xl font-bold border border-violet-100 dark:border-violet-500/20 hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-all"
              >
                {tag.name}
                <span className="text-violet-400 dark:text-violet-500 font-mono text-xs">{tag.count}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Rankings row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Most Watched */}
        <div className="card p-6">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-4 flex items-center gap-2 uppercase tracking-wider">
            <Trophy className="w-4 h-4 text-amber-500" /> Najczęściej oglądane
          </h2>
          {stats.mostWatched.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-6">Brak danych</p>
          ) : (
            <div className="space-y-3">
              {stats.mostWatched.map((v, idx) => (
                <div key={v.id}>
                  <Link to={`/video/${v.id}`} className="flex items-center gap-3 group">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${rankBadgeClass(idx)}`}>{idx + 1}</span>
                    <div className="w-10 h-7 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0">
                      {v.thumbnail && <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate group-hover:text-violet-500 dark:group-hover:text-violet-400 transition-colors">{v.title}</p>
                    </div>
                    <span className="text-xs font-bold text-zinc-400 shrink-0 flex items-center gap-1">
                      <Eye className="w-3 h-3" /> {v.views}
                    </span>
                  </Link>
                  <ProgressBar value={v.views} max={maxWatched} indent="ml-10 mt-1.5" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Viewers */}
        <div className="card p-6">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-4 flex items-center gap-2 uppercase tracking-wider">
            <Play className="w-4 h-4 text-violet-500" /> Najbardziej aktywni
          </h2>
          {stats.topViewers.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-6">Brak danych</p>
          ) : (
            <div className="space-y-3">
              {stats.topViewers.map((u, idx) => (
                <div key={u.id}>
                  <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${rankBadgeClass(idx)}`}>{idx + 1}</span>
                    <img src={u.avatar || `https://ui-avatars.com/api/?name=${u.display_name}&background=6366f1&color=fff&size=40`} alt="" className="w-7 h-7 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700 shrink-0" />
                    <span className="text-sm font-semibold text-zinc-900 dark:text-white flex-1 truncate">{u.display_name}</span>
                    <span className="text-xs font-bold text-zinc-400 flex items-center gap-1 shrink-0"><Eye className="w-3 h-3" /> {u.total_views}</span>
                  </div>
                  <ProgressBar value={u.total_views} max={maxViewer} indent="ml-10 mt-1.5" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Authors */}
        <div className="card p-6">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-4 flex items-center gap-2 uppercase tracking-wider">
            <Users className="w-4 h-4 text-emerald-500" /> Top autorzy
          </h2>
          {stats.topAuthors.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-6">Brak danych</p>
          ) : (
            <div className="space-y-3">
              {stats.topAuthors.map((a, idx) => (
                <div key={a.id}>
                  <Link to={`/author/${a.id}`} className="flex items-center gap-3 group">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${rankBadgeClass(idx)}`}>{idx + 1}</span>
                    <img src={a.avatar || `https://ui-avatars.com/api/?name=${a.display_name}&background=6366f1&color=fff&size=40`} alt="" className="w-7 h-7 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700 shrink-0" />
                    <span className="text-sm font-semibold text-zinc-900 dark:text-white flex-1 truncate group-hover:text-violet-500 dark:group-hover:text-violet-400 transition-colors">{a.display_name}</span>
                    <span className="text-xs font-bold text-zinc-400 shrink-0">{a.video_count} filmów</span>
                  </Link>
                  <ProgressBar value={a.video_count} max={maxAuthor} indent="ml-10 mt-1.5" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
