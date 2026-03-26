import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Film, Play } from 'lucide-react';
import { api } from '../utils/api';
import { formatDate } from '../utils/helpers';

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
    <div className="p-6 sm:p-10 max-w-5xl mx-auto animate-fade-in">
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/10 rounded-xl flex items-center justify-center">
            <Clock className="w-5 h-5 text-blue-500" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Historia</h1>
        </div>
        <p className="text-zinc-500 dark:text-zinc-400">Ostatnio obejrzane filmy — Twoja osobista historia przeglądania.</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="card p-4"><div className="h-16 bg-zinc-100 dark:bg-zinc-800 rounded-xl skeleton" /></div>
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-20 h-20 bg-blue-50 dark:bg-blue-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Clock className="w-10 h-10 text-blue-300 dark:text-blue-700" />
          </div>
          <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2 font-display">Brak historii</h3>
          <p className="text-zinc-500 text-sm mb-6">Obejrzyj film, a pojawi się tu w historii.</p>
          <Link to="/" className="btn-primary inline-flex items-center gap-2 text-sm">
            <Film className="w-4 h-4" /> Przeglądaj filmy
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([day, items]) => (
            <div key={day}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-2 h-2 rounded-full bg-indigo-500" />
                <h2 className="text-sm font-bold text-zinc-500 dark:text-zinc-400 font-display uppercase tracking-wider">{day}</h2>
                <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
              </div>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <Link
                    key={`${item.id}-${idx}`}
                    to={`/video/${item.id}`}
                    className="card flex items-center gap-4 p-4 group hover:shadow-lg transition-all hover:-translate-y-0.5"
                  >
                    <div className="relative w-24 h-16 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0">
                      {item.thumbnail ? (
                        <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><Film className="w-6 h-6 text-zinc-400" /></div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <Play className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="white" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-xs text-zinc-500 mt-0.5">{item.author_display_name || item.author_name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[11px] text-zinc-400 font-mono">
                        {new Date(item.watched_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
