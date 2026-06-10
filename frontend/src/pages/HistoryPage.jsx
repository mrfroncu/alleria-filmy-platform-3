import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Film, Play } from 'lucide-react';
import { api } from '../utils/api';

const armHeroMorph = (e) => {
  const thumb = e.currentTarget.querySelector('[data-vt-thumb]');
  if (thumb) thumb.style.viewTransitionName = 'video-hero';
};

export default function HistoryPage() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.getHistory().then(setHistory).catch(console.error).finally(() => setLoading(false));
  }, []);

  // Group by date
  const grouped = history.reduce((acc, item) => {
    const day = new Date(item.watched_at).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (!acc[day]) acc[day] = [];
    acc[day].push(item);
    return acc;
  }, {});

  return (
    <div className="p-5 sm:px-10 sm:py-6 max-w-4xl mx-auto">
      <div className="mb-8 anim-stagger-1">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-2xl flex items-center justify-center animate-float">
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight font-display">
            <span className="text-gradient">Historia</span>
          </h1>
        </div>
        <p className="text-zinc-500 dark:text-zinc-400">Oś czasu Twojego oglądania — od najnowszych.</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="card p-4"><div className="h-16 bg-zinc-100 dark:bg-zinc-800 rounded-xl skeleton" /></div>
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="card p-16 text-center animate-spring-in">
          <div className="w-20 h-20 bg-amber-50 dark:bg-amber-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 animate-float">
            <Clock className="w-10 h-10 text-amber-300 dark:text-amber-700" />
          </div>
          <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2 font-display">Brak historii</h3>
          <p className="text-zinc-500 text-sm mb-6">Obejrzyj film, a pojawi się tu w historii.</p>
          <Link to="/" viewTransition className="btn-primary inline-flex items-center gap-2 text-sm">
            <Film className="w-4 h-4" /> Przeglądaj filmy
          </Link>
        </div>
      ) : (
        /* ── Timeline ── */
        <div className="relative pl-1">
          <div className="timeline-rail" aria-hidden="true" />
          <div className="space-y-10">
            {Object.entries(grouped).map(([day, items], gIdx) => (
              <div key={day} className="animate-slide-up" style={{ animationDelay: `${gIdx * 90}ms`, animationFillMode: 'both' }}>
                {/* Day node */}
                <div className="flex items-center gap-4 mb-4 relative">
                  <span className="timeline-dot">
                    <Clock className="w-3 h-3 text-white" />
                  </span>
                  <h2 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 font-display uppercase tracking-wider">{day}</h2>
                  <span className="px-2 py-0.5 rounded-full bg-ember-50 dark:bg-ember-500/10 border border-ember-100 dark:border-ember-500/20 text-[10px] font-bold text-ember-600 dark:text-ember-300">
                    {items.length} {items.length === 1 ? 'film' : items.length < 5 ? 'filmy' : 'filmów'}
                  </span>
                  <div className="flex-1 h-px bg-gradient-to-r from-zinc-200 dark:from-zinc-800 to-transparent" />
                </div>

                {/* Entries */}
                <div className="space-y-2.5 ml-9 stagger-children">
                  {items.map((item, idx) => (
                    <Link
                      key={`${item.id}-${idx}`}
                      to={`/video/${item.id}`}
                      viewTransition
                      onClick={armHeroMorph}
                      className="card flex items-center gap-4 p-3.5 group hover:shadow-lg transition-all hover:-translate-y-0.5 hover:translate-x-1.5 active:scale-[0.99] relative"
                    >
                      {/* connector */}
                      <span className="absolute -left-[26px] top-1/2 w-5 h-px bg-zinc-200 dark:bg-zinc-800 group-hover:bg-ember-400/60 transition-colors" aria-hidden="true" />

                      <div data-vt-thumb className="relative w-28 h-[4.5rem] rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0">
                        {item.thumbnail ? (
                          <img src={item.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><Film className="w-6 h-6 text-zinc-400" /></div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                          <Play className="w-6 h-6 text-white opacity-0 scale-50 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300" fill="white" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-white truncate group-hover:text-ember-500 dark:group-hover:text-ember-400 transition-colors font-display">
                          {item.title}
                        </h3>
                        <p className="text-xs text-zinc-500 mt-0.5">{item.author_display_name || item.author_name}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="px-2 py-1 rounded-full bg-zinc-100 dark:bg-white/5 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono group-hover:bg-ember-50 dark:group-hover:bg-ember-500/10 group-hover:text-ember-600 dark:group-hover:text-ember-300 transition-colors">
                          {new Date(item.watched_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
