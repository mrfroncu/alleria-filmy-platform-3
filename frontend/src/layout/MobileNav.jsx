import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X, Film } from 'lucide-react';
import SidebarContent from './SidebarContent';
import { SearchTrigger } from '../components/GlobalSearch';

export default function MobileNav({ title }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-4 h-14 border-b border-slate-200 dark:border-white/10 bg-white/90 dark:bg-slate-950/90 backdrop-blur">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-brand-500 to-teal-500 flex items-center justify-center shrink-0">
            <Film className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-display font-bold text-sm text-slate-900 dark:text-white truncate">{title || 'ALLERIA FILMY'}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <SearchTrigger compact />
          <button onClick={() => setOpen(true)} className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5">
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="fixed inset-y-0 left-0 z-50 w-[80%] max-w-[280px] bg-white dark:bg-slate-900 shadow-2xl lg:hidden"
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            >
              <button onClick={() => setOpen(false)} className="absolute top-4 right-3 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10">
                <X className="w-4 h-4" />
              </button>
              <SidebarContent onNavigate={() => setOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
