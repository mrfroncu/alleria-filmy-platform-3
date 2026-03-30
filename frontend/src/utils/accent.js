// Runtime accent color override for Tailwind
// Injects a <style> tag that overrides violet-* classes with chosen color

const THEMES = {
  violet: null, // default — no overrides needed
  blue: {
    50: '239 246 255', 100: '219 234 254', 200: '191 219 254', 300: '147 197 253',
    400: '96 165 250', 500: '59 130 246', 600: '37 99 235', 700: '29 78 216',
    800: '30 64 175', 900: '30 58 138',
  },
  emerald: {
    50: '236 253 245', 100: '209 250 229', 200: '167 243 208', 300: '110 231 183',
    400: '52 211 153', 500: '16 185 129', 600: '5 150 105', 700: '4 120 87',
    800: '6 95 70', 900: '6 78 59',
  },
  rose: {
    50: '255 241 242', 100: '255 228 230', 200: '254 205 211', 300: '253 164 175',
    400: '251 113 133', 500: '244 63 94', 600: '225 29 72', 700: '190 18 60',
    800: '159 18 57', 900: '136 19 55',
  },
  amber: {
    50: '255 251 235', 100: '254 243 199', 200: '253 230 138', 300: '252 211 77',
    400: '251 191 36', 500: '245 158 11', 600: '217 119 6', 700: '180 83 9',
    800: '146 64 14', 900: '120 53 15',
  },
  cyan: {
    50: '236 254 255', 100: '207 250 254', 200: '165 243 252', 300: '103 232 249',
    400: '34 211 238', 500: '6 182 212', 600: '8 145 178', 700: '14 116 144',
    800: '21 94 117', 900: '22 78 99',
  },
};

// Generate CSS override rules for a color theme
function generateOverrides(colorMap) {
  if (!colorMap) return '';
  const shades = Object.entries(colorMap);
  let css = '';
  for (const [shade, rgb] of shades) {
    // Background
    css += `.bg-violet-${shade}{--tw-bg-opacity:1;background-color:rgb(${rgb}/var(--tw-bg-opacity))!important}`;
    // With opacity modifiers
    css += `[class*="bg-violet-${shade}\\/"] { background-color: rgb(${rgb} / var(--tw-bg-opacity, 1)) !important; }`;
    // Text
    css += `.text-violet-${shade}{--tw-text-opacity:1;color:rgb(${rgb}/var(--tw-text-opacity))!important}`;
    // Border
    css += `.border-violet-${shade}{--tw-border-opacity:1;border-color:rgb(${rgb}/var(--tw-border-opacity))!important}`;
    // Ring
    css += `.ring-violet-${shade}{--tw-ring-color:rgb(${rgb}/var(--tw-ring-opacity,1))!important}`;
    // Shadow
    css += `.shadow-violet-${shade}{--tw-shadow-color:rgb(${rgb})!important}`;
    // Gradient from/to
    css += `.from-violet-${shade}{--tw-gradient-from:rgb(${rgb}) var(--tw-gradient-from-position)!important}`;
    css += `.to-violet-${shade}{--tw-gradient-to:rgb(${rgb}) var(--tw-gradient-to-position)!important}`;
  }
  // Also handle dark mode variants and opacity variants
  for (const [shade, rgb] of shades) {
    css += `.dark .dark\\:bg-violet-${shade}{background-color:rgb(${rgb}/var(--tw-bg-opacity,1))!important}`;
    css += `.dark .dark\\:text-violet-${shade}{color:rgb(${rgb}/var(--tw-text-opacity,1))!important}`;
    css += `.dark .dark\\:border-violet-${shade}{border-color:rgb(${rgb}/var(--tw-border-opacity,1))!important}`;
    // Opacity variants like bg-violet-500/10
    css += `[class*="bg-violet-${shade}\\/"],.dark [class*="dark\\:bg-violet-${shade}\\/"]{ --accent-rgb: ${rgb}; }`;
  }
  return css;
}

export function applyAccentColor() {
  const theme = localStorage.getItem('accent-color');
  const existing = document.getElementById('accent-override');
  if (existing) existing.remove();

  if (!theme || !THEMES[theme]) return; // violet = default, no override

  const css = generateOverrides(THEMES[theme]);
  if (css) {
    const style = document.createElement('style');
    style.id = 'accent-override';
    style.textContent = css;
    document.head.appendChild(style);
  }
}

export function getAccentThemes() {
  return Object.keys(THEMES);
}
