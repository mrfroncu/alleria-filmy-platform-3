import React from 'react';
import { motion } from 'framer-motion';

const VARIANTS = {
  primary: 'text-white bg-gradient-to-br from-brand-500 to-teal-500 shadow-glow hover:brightness-110',
  secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/15',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5',
  danger: 'text-white bg-rose-500 hover:bg-rose-600',
};

const SIZES = {
  sm: 'text-xs px-3 py-1.5 rounded-xl gap-1.5',
  md: 'text-sm px-4 py-2.5 rounded-2xl gap-2',
  icon: 'p-2.5 rounded-xl',
};

export default function Button({
  as: Comp = motion.button,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  children,
  ...props
}) {
  return (
    <Comp
      whileTap={disabled ? undefined : { scale: 0.96 }}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      disabled={disabled}
      className={`inline-flex items-center justify-center font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {children}
    </Comp>
  );
}
