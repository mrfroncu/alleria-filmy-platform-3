/** @type {import('tailwindcss').Config} */

/* ════════════════════════════════════════════════════════════════
   ALLERIA FILMY — Design System v3 "EMBER"
   Warm cinematic palette: projector amber + curtain rose on
   deep warm charcoal. Kinetic, springy, morph-driven motion.
   ════════════════════════════════════════════════════════════════ */

// Primary brand scale — "ember" (projector light)
const ember = {
  50: '#fff8eb',
  100: '#ffeec6',
  200: '#ffd988',
  300: '#ffbe4a',
  400: '#ffa520',
  500: '#f98307',
  600: '#dd5f02',
  700: '#b74006',
  800: '#94300c',
  900: '#7a290d',
  950: '#461302',
};

// Secondary brand scale — "curtain" rose
const curtain = {
  50: '#fff1f2',
  100: '#ffe4e6',
  200: '#fecdd3',
  300: '#fda4af',
  400: '#fb7185',
  500: '#f43f5e',
  600: '#e11d48',
  700: '#be123c',
  800: '#9f1239',
  900: '#881337',
  950: '#4c0519',
};

// Warm neutral scale (stone) — replaces the cold zinc grays
const warmGray = {
  50: '#fafaf9',
  100: '#f5f5f4',
  200: '#e7e5e4',
  300: '#d6d3d1',
  400: '#a8a29e',
  500: '#78716c',
  600: '#57534e',
  700: '#44403c',
  800: '#292524',
  900: '#1c1917',
  950: '#0c0a09',
};

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ember,
        curtain,
        // ── Legacy aliases ──
        // Older pages still reference violet/fuchsia/zinc utility classes.
        // They resolve to the Ember tokens so the whole app wears one skin.
        violet: ember,
        fuchsia: curtain,
        purple: ember,
        zinc: warmGray,
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Sora', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        'glow-sm': '0 0 16px rgba(249, 131, 7, 0.22)',
        'glow': '0 0 32px rgba(249, 131, 7, 0.3)',
        'glow-lg': '0 0 64px rgba(249, 131, 7, 0.35)',
        'ember': '0 8px 30px -8px rgba(249, 131, 7, 0.45)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'gradient-flow': 'gradientFlow 6s ease infinite',
        'float': 'float 3.2s ease-in-out infinite',
        'spin-slow': 'spinSlow 8s linear infinite',
        'pulse-soft': 'pulseSoft 2.5s ease-in-out infinite',
        'wiggle': 'wiggle 0.5s ease-in-out',
        'pop-in': 'popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(16px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideInLeft: { '0%': { opacity: '0', transform: 'translateX(-16px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        gradientFlow: { '0%, 100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } },
        float: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-7px)' } },
        spinSlow: { to: { transform: 'rotate(360deg)' } },
        pulseSoft: { '0%, 100%': { opacity: '0.6' }, '50%': { opacity: '1' } },
        wiggle: { '0%, 100%': { transform: 'rotate(0deg)' }, '25%': { transform: 'rotate(-6deg)' }, '75%': { transform: 'rotate(6deg)' } },
        popIn: { '0%': { opacity: '0', transform: 'scale(0.6)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
      }
    }
  },
  plugins: [],
};
