// EMBER motion engine v2 — view-transition morphs, click ripples,
// 3D card tilt and particle bursts. Zero dependencies.
import { flushSync } from 'react-dom';

let fxInited = false;

const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Run a React state update inside a View Transition so the DOM change
 * MORPHS instead of snapping. Every element that keeps the same
 * view-transition-name across the update physically glides/resizes
 * to its new place (tiles → list rows, card → preview panel, tab pills…).
 * flushSync guarantees the DOM is committed before the new snapshot.
 */
export function morph(update) {
  if (document.startViewTransition && !reducedMotion()) {
    return document.startViewTransition(() => flushSync(update));
  }
  update();
}

/**
 * Particle burst from the center of an element (favorites, success actions).
 */
export function burst(el, colors = ['#f98307', '#f43f5e', '#ffbe4a', '#fb7185', '#ffd988']) {
  if (!el || reducedMotion()) return;
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const count = 14;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = 'fx-particle';
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const dist = 28 + Math.random() * 46;
    p.style.left = `${cx}px`;
    p.style.top = `${cy}px`;
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
    p.style.setProperty('--c', colors[i % colors.length]);
    p.style.animationDelay = `${Math.random() * 60}ms`;
    document.body.appendChild(p);
    p.addEventListener('animationend', () => p.remove(), { once: true });
    setTimeout(() => p.remove(), 1200);
  }
}

/* ── internals ── */

function spawnRipple(e) {
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
  setTimeout(cleanup, 900);
}

/* 3D tilt — elements with [data-tilt] lean toward the pointer.
   This is a transform on the card itself, NOT a light/spotlight effect. */
let tiltRaf = 0;
function handleTiltMove(e) {
  const card = e.target.closest?.('[data-tilt]');
  if (!card) return;
  if (tiltRaf) return;
  tiltRaf = requestAnimationFrame(() => {
    tiltRaf = 0;
    const rect = card.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;   // -0.5 … 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.setProperty('--ry', `${(px * 7).toFixed(2)}deg`);
    card.style.setProperty('--rx', `${(-py * 7).toFixed(2)}deg`);
    card.style.setProperty('--ty', '-6px');
    card.style.setProperty('--sc', '1.015');
  });
}
function handleTiltLeave(e) {
  const card = e.target.closest?.('[data-tilt]');
  if (!card) return;
  card.style.setProperty('--rx', '0deg');
  card.style.setProperty('--ry', '0deg');
  card.style.setProperty('--ty', '0px');
  card.style.setProperty('--sc', '1');
}

/**
 * Install global interaction effects (once, from main.jsx).
 */
export function initFx() {
  if (fxInited || typeof document === 'undefined') return;
  fxInited = true;
  document.addEventListener('pointerdown', spawnRipple, { passive: true });
  if (window.matchMedia('(hover: hover)').matches && !reducedMotion()) {
    document.addEventListener('pointermove', handleTiltMove, { passive: true });
    document.addEventListener('pointerout', handleTiltLeave, { passive: true });
  }
}
