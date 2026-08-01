import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Film, Tag as TagIcon, Command, CornerDownLeft } from 'lucide-react';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';

export function SearchTrigger({ compact = false }) {
  const { setOpen } = useGlobalSearch();
  return (
    <button
      onClick={() => setOpen(true)}
      className={compact
        ? 'p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
        : 'flex items-center gap-2 w-full max-w-sm px-4 py-2 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-400 text-sm hover:bg-slate-200 dark:hover:bg-white/10 transition-colors'}
    >
      <Search className="w-4 h-4" />
      {!compact && <><span className="flex-1 text-left">Szukaj...</span><span className="text-[10px] font-mono bg-white dark:bg-white/10 px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/10">Ctrl K</span></>}
    </button>
  );
}

export function SearchModal() {
  const { open, setOpen, query, setQuery, results, activeIndex, setActiveIndex, go } = useGlobalSearch();
  const inputRef = useRef(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  const onKeyNav = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[activeIndex]) go(results[activeIndex].path); }
  };

  return ReactDOM.createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="absolute inset-0 bg-slate-950/60" onClick={() => setOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="relative w-full max-w-lg rounded-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-white/10">
              <Search className="w-4.5 h-4.5 text-slate-400" />
              <input
                ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyNav}
                placeholder="Szukaj stron, filmów, tagów..."
                className="flex-1 bg-transparent outline-none text-sm text-slate-900 dark:text-white placeholder:text-slate-400"
              />
              <Command className="w-3.5 h-3.5 text-slate-300" />
            </div>
            <div className="max-h-96 overflow-y-auto p-2">
              {results.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-8">Brak wyników.</p>
              ) : results.map((r, i) => (
                <button
                  key={`${r.type}-${r.path}-${i}`}
                  onClick={() => go(r.path)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors ${i === activeIndex ? 'bg-brand-500/10' : ''}`}
                >
                  {r.type === 'video' ? (
                    <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 overflow-hidden shrink-0">{r.thumbnail && <img src={r.thumbnail} alt="" className="w-full h-full object-cover" />}</div>
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center shrink-0">
                      {r.type === 'tag' ? <TagIcon className="w-3.5 h-3.5 text-slate-400" /> : <Film className="w-3.5 h-3.5 text-slate-400" />}
                    </div>
                  )}
                  <span className="text-sm text-slate-700 dark:text-slate-200 truncate flex-1">{r.label}</span>
                  {i === activeIndex && <CornerDownLeft className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
