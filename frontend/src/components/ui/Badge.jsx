import React from 'react';

const TONES = {
  brand: 'bg-brand-500/10 text-brand-600 dark:text-brand-300',
  teal: 'bg-teal-500/10 text-teal-600 dark:text-teal-300',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
  neutral: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
};

export default function Badge({ tone = 'neutral', className = '', children }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}
