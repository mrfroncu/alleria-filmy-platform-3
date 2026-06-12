import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Film, Eye, Tag, Trophy, TrendingUp, Play } from 'lucide-react';
import { api } from '../utils/api';
import { useCountUp } from '../utils/hooks';

function BigNumber({ value, className = '' }) {
  const display = useCountUp(value);
  return <span className={className}>{display}</span>;
}

export default function StatsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getStats().then(setStats).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-5 sm:px-10 sm:py-6 max-w-7xl mx-auto">
        <div className="h-10 w-48 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton mb-10" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[1,2,3,4].map(i => <div key={i} className="card p-6"><div className="h-16 skeleton rounded-xl" /></div>)}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const maxWatched = Math.max(1, ...stats.mostWatched.map(v => v.views || 0));
  const maxViewer = Math.max(1, ...stats.topViewers.map(u => u.total_views || 0));
  const maxAuthor = Math.max(1, ...stats.topAuthors.map(a => a.video_count || 0));

  return (
    <div className="p-5 sm:px-10 sm:py-6 max-w-7xl mx-auto">
      <div className="mb-8 anim-stagger-1">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 bg-ember-50 dark:bg-ember-500/10 border border-ember-100 dark:border-ember-500/20 rounded-2xl flex items-center justify-center animate-float">
            <BarChart3 className="w-5 h-5 text-ember-500" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight font-display">
            <span className="text-gradient">Statystyki</span>
          </h1>
        </div>
        <p className="text-zinc-500 dark:text-zinc-400">Podsumowanie aktywności społeczności i Twoje osobiste statystyki.</p>
      </div>

      {/* ════ BENTO GRID ════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 auto-rows-auto gap-4">

        {/* Hero tile — library size */}
        <div className="bento card col-span-2 row-span-2 p-7 flex flex-col justify-between relative overflow-hidden transition-all animate-slide-up" style={{ animationFillMode: 'both' }}>
          <div className="absolute -right-10 -bottom-10 opacity-[0.06] dark:opacity-[0.08]" aria-hidden="true">
            <Film className="w-56 h-56 text-ember-500 animate-spin-slow" style={{ animationDuration: '40s' }} />
          </div>
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-ember-500" />
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-ember-500 font-display">Biblioteka</span>
          </div>
          <div>
            <BigNumber value={stats.totalVideos} className="text-6xl sm:text-7xl font-extrabold text-gradient font-display tracking-tight" />
            <p className="text-sm text-zinc-500 mt-2 font-medium">filmów w bazie społeczności</p>
          </div>
          <div className="flex items-center gap-5 pt-4 border-t border-zinc-100 dark:border-white/[0.06]">
            <div>
              <BigNumber value={stats.totalViews} className="text-xl font-extrabold text-zinc-900 dark:text-white font-display" />
              <p className="text-[10px] text-zinc-400 font-medium">wyświetleń</p>
            </div>
            <div>
              <BigNumber value={stats.totalUsers} className="text-xl font-extrabold text-zinc-900 dark:text-white font-display" />
              <p className="text-[10px] text-zinc-400 font-medium">użytkowników</p>
            </div>
            <div>
              <BigNumber value={stats.totalTags} className="text-xl font-extrabold text-zinc-900 dark:text-white font-display" />
              <p className="text-[10px] text-zinc-400 font-medium">tagów</p>
            </div>
          </div>
        </div>

        {/* Personal tiles */}
        <div className="bento card p-6 transition-all animate-slide-up" style={{ animationDelay: '80ms', animationFillMode: 'both' }}>
          <div className="w-10 h-10 rounded-2xl bg-ember-50 dark:bg-ember-500/10 text-ember-500 flex items-center justify-center mb-3">
            <Eye className="w-5 h-5" />
          </div>
          <BigNumber value={stats.myStats.views} className="text-3xl font-extrabold text-zinc-900 dark:text-white font-display" />
          <p className="text-xs text-zinc-500 font-medium mt-1">Twoje obejrzane</p>
        </div>
        <div className="bento card p-6 transition-all animate-slide-up" style={{ animationDelay: '140ms', animationFillMode: 'both' }}>
          <div className="w-10 h-10 rounded-2xl bg-curtain-50 dark:bg-curtain-500/10 text-curtain-500 flex items-center justify-center mb-3">
            <TrendingUp className="w-5 h-5" />
          </div>
          <BigNumber value={stats.myStats.favorites} className="text-3xl font-extrabold text-zinc-900 dark:text-white font-display" />
          <p className="text-xs text-zinc-500 font-medium mt-1">Twoje ulubione</p>
        </div>

        {/* Tag cloud */}
        <div className="bento card col-span-2 p-6 transition-all animate-slide-up" style={{ animationDelay: '200ms', animationFillMode: 'both' }}>
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-3 flex items-center gap-2">
            <Tag className="w-4 h-4 text-curtain-500" /> Popularne tagi
          </h2>
          {stats.tagCloud.length === 0 ? (
            <p className="text-sm text-zinc-400 py-3">Brak tagów</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 stagger-children">
              {stats.tagCloud.map((tag, idx) => {
                const size = idx < 3 ? 'text-sm px-3.5 py-1.5' : idx < 8 ? 'text-xs px-3 py-1' : 'text-[11px] px-2.5 py-1';
                return (
                  <Link key={tag.id} to={`/tag/${tag.id}`} viewTransition className={`tag-chip ${size}`}>
                    {tag.name}
                    <span className="text-ember-400 dark:text-ember-500 font-mono">{tag.count}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Most watched — ranked bars */}
        <div className="bento card col-span-2 p-6 transition-all animate-slide-up" style={{ animationDelay: '260ms', animationFillMode: 'both' }}>
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-4 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500 animate-float" /> Najczęściej oglądane
          </h2>
          {stats.mostWatched.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-6">Brak danych</p>
          ) : (
            <div className="space-y-1.5 stagger-children">
              {stats.mostWatched.map((v, idx) => (
                <Link key={v.id} to={`/video/${v.id}`} viewTransition className="block px-3 py-2 rounded-2xl hover:bg-zinc-50 dark:hover:bg-white/5 hover:translate-x-1 transition-all active:scale-[0.98] group">
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 transition-transform group-hover:scale-110 ${
                      idx === 0 ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300' :
                      idx === 1 ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300' :
                      idx === 2 ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300' :
                      'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                    }`}>{idx + 1}</span>
                    <div className="w-9 h-6 rounded-md overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0">
                      {v.thumbnail && <img src={v.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />}
                    </div>
                    <p className="flex-1 min-w-0 text-sm font-semibold text-zinc-900 dark:text-white truncate group-hover:text-ember-500 transition-colors">{v.title}</p>
                    <span className="text-xs font-bold text-zinc-400 shrink-0 flex items-center gap-1"><Eye className="w-3 h-3" /> {v.views}</span>
                  </div>
                  <div className="ml-9 h-1.5 rounded-full bg-zinc-100 dark:bg-white/5 overflow-hidden">
                    <div className="stat-bar !h-full" style={{ width: `${Math.max(6, (v.views / maxWatched) * 100)}%` }} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Top viewers — bars */}
        <div className="bento card col-span-2 lg:col-span-1 p-6 transition-all animate-slide-up" style={{ animationDelay: '320ms', animationFillMode: 'both' }}>
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-4 flex items-center gap-2">
            <Play className="w-4 h-4 text-ember-500" /> Najbardziej aktywni
          </h2>
          {stats.topViewers.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-6">Brak danych</p>
          ) : (
            <div className="space-y-2.5 stagger-children">
              {stats.topViewers.map((u) => (
                <div key={u.id} className="group">
                  <div className="flex items-center gap-2.5 mb-1">
                    <img src={u.avatar || `https://ui-avatars.com/api/?name=${u.display_name}&background=8b5cf6&color=fff&size=40`} alt="" className="w-7 h-7 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700 group-hover:scale-110 transition-transform" />
                    <span className="text-[13px] font-semibold text-zinc-900 dark:text-white flex-1 truncate">{u.display_name}</span>
                    <span className="text-[11px] font-bold text-zinc-400">{u.total_views}</span>
                  </div>
                  <div className="ml-9 h-1.5 rounded-full bg-zinc-100 dark:bg-white/5 overflow-hidden">
                    <div className="stat-bar !h-full" style={{ width: `${Math.max(6, (u.total_views / maxViewer) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top authors — bars */}
        <div className="bento card col-span-2 lg:col-span-1 p-6 transition-all animate-slide-up" style={{ animationDelay: '380ms', animationFillMode: 'both' }}>
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white font-display mb-4 flex items-center gap-2">
            <Film className="w-4 h-4 text-emerald-500" /> Top autorzy
          </h2>
          {stats.topAuthors.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-6">Brak danych</p>
          ) : (
            <div className="space-y-2.5 stagger-children">
              {stats.topAuthors.map((a) => (
                <Link key={a.id} to={`/author/${a.id}`} viewTransition className="block group">
                  <div className="flex items-center gap-2.5 mb-1">
                    <img src={a.avatar || `https://ui-avatars.com/api/?name=${a.display_name}&background=8b5cf6&color=fff&size=40`} alt="" className="w-7 h-7 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700 group-hover:scale-110 group-hover:-rotate-3 transition-transform" />
                    <span className="text-[13px] font-semibold text-zinc-900 dark:text-white flex-1 truncate group-hover:text-ember-500 transition-colors">{a.display_name}</span>
                    <span className="text-[11px] font-bold text-zinc-400">{a.video_count}</span>
                  </div>
                  <div className="ml-9 h-1.5 rounded-full bg-zinc-100 dark:bg-white/5 overflow-hidden">
                    <div className="stat-bar !h-full" style={{ width: `${Math.max(6, (a.video_count / maxAuthor) * 100)}%` }} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
