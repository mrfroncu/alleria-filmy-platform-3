import React from 'react';

export function Label({ children, className = '' }) {
  return (
    <label className={`block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 font-display ${className}`}>
      {children}
    </label>
  );
}

export default function Input({ className = '', ...props }) {
  return (
    <input
      className={`w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition-shadow focus:border-brand-400 focus:ring-2 focus:ring-brand-400/30 ${className}`}
      {...props}
    />
  );
}
