import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';

// Cloudflare Turnstile captcha (explicit rendering). Cloudflare asks for api.js to be loaded
// straight from their domain — never bundled, proxied or cached — so it's injected once, on demand.
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.async = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')));
      s.onerror = () => { scriptPromise = null; s.remove(); reject(new Error('turnstile load failed')); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

// onToken(token | null) fires with a fresh token when the check passes and with null when it
// expires or errors. A token is single-use on the server, so the parent calls ref.reset() after
// every request that spent one — that also clears it via onToken(null).
const TurnstileWidget = forwardRef(function TurnstileWidget({ siteKey, action, onToken }, ref) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const [loadFailed, setLoadFailed] = useState(false);

  useImperativeHandle(ref, () => ({
    reset() {
      onTokenRef.current(null);
      if (widgetIdRef.current != null) window.turnstile?.reset(widgetIdRef.current);
    },
  }), []);

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          language: 'pl',
          size: 'flexible',
          // The app's theme is the `dark` class on <html>, not the OS preference Turnstile's 'auto' reads
          theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'timeout-callback': () => onTokenRef.current(null),
          'error-callback': () => { onTokenRef.current(null); },
        });
      })
      .catch(() => { if (!cancelled) setLoadFailed(true); });
    return () => {
      cancelled = true;
      if (widgetIdRef.current != null) {
        try { window.turnstile?.remove(widgetIdRef.current); } catch (_) {}
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, action]);

  if (loadFailed) {
    return (
      <div className="p-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-[11px] leading-snug flex items-start gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>Nie udało się wczytać captchy Cloudflare. Wyłącz blokowanie skryptów dla tej strony i odśwież ją.</span>
      </div>
    );
  }
  // min-h = the widget's fixed 65px height, so the buttons below don't jump when it appears
  return <div ref={containerRef} className="min-h-[65px] w-full" />;
});

export default TurnstileWidget;
