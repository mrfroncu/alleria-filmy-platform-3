import React from 'react';
import { motion } from 'framer-motion';
import { Hammer } from 'lucide-react';

export default function ComingSoon({ title, phase }) {
  return (
    <div className="p-6 sm:p-10 max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-4xl border border-dashed border-slate-300 dark:border-white/15 p-12 text-center"
      >
        <div className="w-14 h-14 rounded-2xl bg-brand-500/10 flex items-center justify-center mx-auto mb-4">
          <Hammer className="w-6 h-6 text-brand-500" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white font-display mb-2">{title}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ta strona jeszcze nie została przebudowana w nowym interfejsie — zaplanowana na {phase}.
        </p>
      </motion.div>
    </div>
  );
}
