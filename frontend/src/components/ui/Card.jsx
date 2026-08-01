import React from 'react';
import { motion } from 'framer-motion';

export default function Card({ as: Comp = motion.div, hover = false, className = '', children, ...props }) {
  return (
    <Comp
      className={`rounded-4xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm ${
        hover ? 'transition-shadow hover:shadow-xl hover:shadow-brand-500/5' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </Comp>
  );
}
