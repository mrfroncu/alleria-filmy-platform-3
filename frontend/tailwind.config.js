/** @type {import('tailwindcss').Config} */

/* ════════════════════════════════════════════════════════════════
   ALLERIA FILMY — Design System v4 "Cinema"
   Layout & motion from the Cinema rebuild (billboard hero, shelves,
   morph engine), recolored to the classic violet/fuchsia palette.
   The `ember`/`curtain` token names are kept (components reference
   them) but they now resolve to violet / fuchsia.
   ════════════════════════════════════════════════════════════════ */

// Primary brand scale — classic violet
const ember = {
  50: '#f5f3ff',
  100: '#ede9fe',
  200: '#ddd6fe',
  300: '#c4b5fd',
  400: '#a78bfa',
  500: '#8b5cf6',
  600: '#7c3aed',
  700: '#6d28d9',
  800: '#5b21b6',
  900: '#4c1d95',
  950: '#2e1065',
};

// Secondary brand scale — classic fuchsia
const curtain = {
  50: '#fdf4ff',
  100: '#fae8ff',
  200: '#f5d0fe',
  300: '#f0abfc',
  400: '#e879f9',
  500: '#d946ef',
  600: '#c026d3',
  700: '#a21caf',
  800: '#86198f',
  900: '#701a75',
  950: '#4a044e',
};

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ember,
        curtain,
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
        'glow-sm': '0 0 16px rgba(139, 92, 246, 0.22)',
        'glow': '0 0 32px rgba(139, 92, 246, 0.3)',
        'glow-lg': '0 0 64px rgba(139, 92, 246, 0.35)',
        'ember': '0 8px 30px -8px rgba(139, 92, 246, 0.45)',
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
