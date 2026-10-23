import React from 'react';
import { Star, Heart, RotateCcw } from 'lucide-react';

// Shown over the player a second after playback ends. The rating is only ever visible to editors
// (in analytics); the viewer just sees their own pick.
export default function PlayerEndScreen({ rating = 0, onRate, isFav, onToggleFav, favDisabled, onReplay }) {
  const [hover, setHover] = React.useState(0);
  const shown = hover || rating;
  return (
    <div className="absolute inset-0 z-40 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={e => e.stopPropagation()}>
      <div className="text-center max-w-md w-full">
        {onRate && (
          <>
            <p className="text-white text-lg sm:text-xl font-bold font-display mb-4">Oceń film</p>
            <div className="flex items-center justify-center gap-1 sm:gap-2 mb-6" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => onRate(n)}
                  onMouseEnter={() => setHover(n)}
                  aria-label={`${n} / 5`}
                  className="p-1 transition-transform hover:scale-125 active:scale-95"
                >
                  <Star className={`w-8 h-8 sm:w-10 sm:h-10 transition-colors ${n <= shown ? 'fill-amber-400 text-amber-400' : 'text-zinc-600'}`} />
                </button>
              ))}
            </div>
          </>
        )}
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {onToggleFav && (
            <button
              onClick={onToggleFav}
              disabled={favDisabled}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-50 ${isFav ? 'bg-pink-500/20 text-pink-400' : 'bg-white/10 hover:bg-white/20 text-white'}`}
            >
              <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
              {isFav ? 'W ulubionych' : 'Dodaj do ulubionych'}
            </button>
          )}
          <button onClick={onReplay} className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm bg-violet-500 hover:bg-violet-600 text-white transition-all active:scale-95">
            <RotateCcw className="w-4 h-4" />
            Odtwórz ponownie
          </button>
        </div>
      </div>
    </div>
  );
}
