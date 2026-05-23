/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        ember: {
          DEFAULT: '#ff5b2e',
          2: '#ff8a5e',
          dim: 'rgba(255,91,46,0.12)',
          glow: 'rgba(255,91,46,0.45)',
        },
        'a-bg': {
          0: '#0a0a10',
          1: '#11111a',
          2: '#181822',
          3: '#22222e',
          4: '#2e2e3c',
        },
        'a-fg': {
          DEFAULT: '#f6f6fa',
          2: '#a8a8b8',
          3: '#6b6b7c',
          4: '#3d3d4a',
        },
        cyber: '#4dd9e8',
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'float1': 'float1 24s ease-in-out infinite',
        'float2': 'float2 28s ease-in-out infinite',
        'float3': 'float3 32s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(16px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideInLeft: { '0%': { opacity: '0', transform: 'translateX(-16px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        float1: { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '50%': { transform: 'translate(8vw, 5vh) scale(1.15)' } },
        float2: { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '50%': { transform: 'translate(-6vw, -4vh) scale(0.9)' } },
        float3: { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '50%': { transform: 'translate(4vw, -8vh) scale(1.2)' } },
      }
    }
  },
  plugins: [],
};
