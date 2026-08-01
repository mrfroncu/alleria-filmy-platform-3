import React, { useState } from 'react';

const SIZES = { sm: 'w-7 h-7 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-16 h-16 text-xl', xl: 'w-24 h-24 text-3xl' };

export default function Avatar({ src, name, size = 'md', className = '' }) {
  const [errored, setErrored] = useState(false);
  const initial = (name || '?').trim().charAt(0).toUpperCase();

  if (src && !errored) {
    return (
      <img
        src={src}
        alt={name || 'avatar'}
        onError={() => setErrored(true)}
        className={`${SIZES[size]} rounded-2xl object-cover shrink-0 ${className}`}
      />
    );
  }
  return (
    <div className={`${SIZES[size]} rounded-2xl shrink-0 flex items-center justify-center font-bold text-white bg-gradient-to-br from-brand-500 to-teal-500 ${className}`}>
      {initial}
    </div>
  );
}
