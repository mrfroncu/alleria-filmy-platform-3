import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Film, Users, Eye, Tag, Trophy, TrendingUp, Play } from 'lucide-react';
import { api } from '../utils/api';
import { useCountUp } from '../utils/hooks';

function StatCard({ icon: Icon, label, value, color, sub, delay = 0 }) {
  const display = useCountUp(value);
  return (
    <div className="card p-6 group hover:-translate-y-1 hover:shadow-xl transition-all animate-slide-up" style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white font-display tracking-tight">{display}</p>
      <p className="text-xs text-zinc-500 font-medium mt-1">{label}</p>
      {sub && <p className="text-[10px] text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function MyStat({ value, label }) {
  const display = useCountUp(value);
  return (
    <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl hover:bg-ember-50 dark:hover:bg-ember-500/5 transition-colors">
      <p className="text-2xl font-extrabold text-zinc-900 dark:text-white font-display">{display}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}

export default function StatsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getStats().then(setStats).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6 sm:p-10 max-w-7xl mx-auto">
        <div className="h-10 w-48 bg-zinc-100 dark:bg-zinc-800 rounded-lg skeleton mb-10" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[1,2,3,4].map(i => <div key={i} className="card p-6"><div className="h-16 skeleton rounded-xl" /></div>)}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto">
      <div className="mb-10 anim-stagger-1">
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

      {/* Overview Cards — numbers count up */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Film} label="Filmów w bazie" value={stats.totalVideos} color="bg-ember-50 dark:bg-ember-500/10 text-ember-500" delay={0} />
        <StatCard icon={Users} label="Użytkowników" value={stats.totalUsers} color="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500" delay={70} />
        <StatCard icon={Eye} label="Łącznie wyświetleń" value={stats.totalViews} color="bg-amber-50 dark:bg-amber-500/10 text-amber-500" delay={140} />
        <StatCard icon={Tag} label="Tagów" value={stats.totalTags} color="bg-curtain-50 dark:bg-curtain-500/10 text-curtain-500" delay={210} />
      </div>

      {/* Personal Stats */}
      <div className="card p-6 mb-8 anim-stagger-3">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-ember-500" /> Twoje statystyki
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <MyStat value={stats.myStats.views} label="Obejrzanych filmów" />
          <MyStat value={stats.myStats.favorites} label="Ulubionych" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Watched */}
        <div className="card p-6 anim-stagger-4">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500 animate-float" /> Najczęściej oglądane
          </h2>
          {stats.mostWatched.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-6">Brak danych</p>
          ) : (
            <div className="space-y-2 stagger-children">
              {stats.mostWatched.map((v, idx) => (
                <Link key={v.id} to={`/video/${v.id}`} viewTransition className="flex items-center gap-3 p-3 rounded-2xl hover:bg-zinc-50 dark:hover:bg-white/5 hover:translate-x-1 transition-all active:scale-[0.98] group">
                  <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 transition-transform group-hover:scale-110 ${
                    idx === 0 ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300' :
                    idx === 1 ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300' :
                    idx === 2 ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300' :
                    'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                  }`}>{idx + 1}</span>
                  <div className="w-10 h-7 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0">
                    {v.thumbnail && <img src={v.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate group-hover:text-ember-500 dark:group-hover:text-ember-400 transition-colors">{v.title}</p>
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
        <div className="card p-6 anim-stagger-4">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-4 flex items-center gap-2">
            <Play className="w-5 h-5 text-ember-500" /> Najbardziej aktywni
          </h2>
          {stats.topViewers.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-6">Brak danych</p>
          ) : (
            <div className="space-y-2 stagger-children">
              {stats.topViewers.map((u, idx) => (
                <div key={u.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-zinc-50 dark:hover:bg-white/5 hover:translate-x-1 transition-all">
                  <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                    idx === 0 ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300' :
                    'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                  }`}>{idx + 1}</span>
                  <img src={u.avatar || `https://ui-avatars.com/api/?name=${u.display_name}&background=dd5f02&color=fff&size=40`} alt="" className="w-8 h-8 rounded-xl object-cover border border-zinc-200 dark:border-zinc-700" />
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white flex-1 truncate">{u.display_name}</span>
                  <span className="text-xs font-bold text-zinc-400 flex items-center gap-1"><Eye className="w-3 h-3" /> {u.total_views}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Authors */}
        <div className="card p-6 anim-stagger-5">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-4 flex items-center gap-2">
            <Film className="w-5 h-5 text-emerald-500" /> Top autorzy
          </h2>
          {stats.topAuthors.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-6">Brak danych</p>
          ) : (
            <div className="space-y-2 stagger-children">
              {stats.topAuthors.map((a) => (
                <Link key={a.id} to={`/author/${a.id}`} viewTransition className="flex items-center gap-3 p-3 rounded-2xl hover:bg-zinc-50 dark:hover:bg-white/5 hover:translate-x-1 transition-all active:scale-[0.98] group">
                  <img src={a.avatar || `https://ui-avatars.com/api/?name=${a.display_name}&background=dd5f02&color=fff&size=40`} alt="" className="w-8 h-8 rounded-xl object-cover border border-zinc-200 dark:border-zinc-700 group-hover:scale-110 group-hover:-rotate-3 transition-transform" />
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white flex-1 truncate group-hover:text-ember-500 dark:group-hover:text-ember-400 transition-colors">{a.display_name}</span>
                  <span className="text-xs font-bold text-zinc-400">{a.video_count} filmów</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Tag Cloud */}
        <div className="card p-6 anim-stagger-5">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display mb-4 flex items-center gap-2">
            <Tag className="w-5 h-5 text-curtain-500" /> Popularne tagi
          </h2>
          {stats.tagCloud.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-6">Brak tagów</p>
          ) : (
            <div className="flex flex-wrap gap-2 stagger-children">
              {stats.tagCloud.map((tag, idx) => {
                const size = idx < 3 ? 'text-sm px-4 py-2' : idx < 8 ? 'text-xs px-3 py-1.5' : 'text-[11px] px-2.5 py-1';
                return (
                  <Link
                    key={tag.id}
                    to={`/tag/${tag.id}`}
                    viewTransition
                    className={`tag-chip ${size}`}
                  >
                    {tag.name}
                    <span className="text-ember-400 dark:text-ember-500 font-mono">{tag.count}</span>
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
