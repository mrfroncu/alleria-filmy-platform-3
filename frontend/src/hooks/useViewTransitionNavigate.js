import { useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';

// Wraps react-router's navigate() in the View Transitions API when the browser
// supports it — a root-level cross-fade only, no per-element view-transition-name
// assignments (that's the part that caused problems in a past attempt).
// Falls back to a plain navigate() on browsers without support (e.g. Firefox).
export default function useViewTransitionNavigate() {
  const navigate = useNavigate();

  return useCallback((to, options) => {
    if (!document.startViewTransition) {
      navigate(to, options);
      return;
    }
    document.startViewTransition(() => {
      flushSync(() => navigate(to, options));
    });
  }, [navigate]);
}
