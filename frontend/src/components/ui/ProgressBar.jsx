import React from 'react';
import { motion } from 'framer-motion';

export default function ProgressBar({ value, tone = 'brand', className = '', trackClassName = '' }) {
  const pct = Math.max(0, Math.min(100, value));
  const fill = tone === 'brand' ? 'bg-gradient-to-r from-brand-500 to-teal-500' : 'bg-amber-500';
  return (
    <div className={`h-1.5 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden ${trackClassName} ${className}`}>
      <motion.div
        className={`h-full rounded-full ${fill}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      />
    </div>
  );
}
