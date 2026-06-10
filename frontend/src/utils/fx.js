// EMBER motion utilities — click ripples + view-transition morphs.

let fxInited = false;

/**
 * Global click-ripple system. Every button/link press spawns a soft
 * ripple from the pointer position. Opt out with [data-no-ripple]
 * on the element or any ancestor.
 */
export function initFx() {
  if (fxInited || typeof document === 'undefined') return;
  fxInited = true;

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const host = e.target.closest?.('button, a, [data-ripple]');
    if (!host || host.closest('[data-no-ripple]')) return;
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    if (getComputedStyle(host).position === 'static') {
      host.classList.add('fx-ripple-host');
    }

    const wrap = document.createElement('span');
    wrap.className = 'fx-ripple-wrap';
    wrap.setAttribute('aria-hidden', 'true');
    const ripple = document.createElement('span');
    ripple.className = 'fx-ripple';
    const size = Math.hypot(rect.width, rect.height) * 2;
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left}px`;
    ripple.style.top = `${e.clientY - rect.top}px`;
    wrap.appendChild(ripple);
    host.appendChild(wrap);

    const cleanup = () => wrap.remove();
    ripple.addEventListener('animationend', cleanup, { once: true });
    setTimeout(cleanup, 900); // safety net if animations are disabled
  }, { passive: true });
}

/**
 * Run a DOM update inside a View Transition so the change MORPHS
 * instead of snapping (tab switches, list reorders, theme flips…).
 * Falls back to a plain update where unsupported.
 */
export function morph(update) {
  if (
    document.startViewTransition &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return document.startViewTransition(update);
  }
  update();
}
