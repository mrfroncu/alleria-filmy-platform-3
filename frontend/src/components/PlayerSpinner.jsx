import React from 'react';

// Violet player loading ring: an arc that stretches and shrinks while the ring turns, a slower
// counter-rotating inner arc and a pulsing core. Styles live in index.css (.player-spinner).
export default function PlayerSpinner({ size = 56, className = '' }) {
  return (
    <div className={`player-spinner ${className}`} style={{ width: size, height: size }} role="status" aria-label="Ładowanie">
      <svg viewBox="0 0 50 50" className="player-spinner-outer" aria-hidden="true">
        <circle cx="25" cy="25" r="20" className="player-spinner-track" />
        <circle cx="25" cy="25" r="20" className="player-spinner-arc" />
      </svg>
      <svg viewBox="0 0 50 50" className="player-spinner-inner" aria-hidden="true">
        <circle cx="25" cy="25" r="12" className="player-spinner-arc-inner" />
      </svg>
      <span className="player-spinner-core" aria-hidden="true" />
    </div>
  );
}
