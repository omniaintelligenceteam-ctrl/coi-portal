import type { Config } from 'tailwindcss';

// Tailwind v4 reads tokens from the `@theme` block in app/globals.css.
// This file is kept for tooling that still expects a config (IDE plugins,
// editor IntelliSense) and to mirror the canonical token set as a fallback.
const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-fraunces)', 'Georgia', 'serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
        display: ['var(--font-fraunces)', 'Georgia', 'serif'],
      },
      letterSpacing: {
        caps: '0.18em',
        display: '-0.02em',
      },
      colors: {
        // Editorial Trust tokens
        paper: {
          DEFAULT: '#FAF8F3',
          deep: '#F4F0E6',
        },
        card: '#FFFFFF',
        ink: {
          DEFAULT: '#1A1F2E',
          muted: '#5B6478',
          faint: '#8A93A6',
        },
        hairline: {
          DEFAULT: '#E8E4DB',
          cool: '#E5E7EB',
          strong: '#D6D1C4',
        },
        brand: {
          DEFAULT: '#003DA5',
          deep: '#001842',
          near: '#000C21',
          soft: '#E6EEF9',
        },
        seal: {
          DEFAULT: '#B8923A',
          soft: '#F5ECD6',
          deep: '#8C6D27',
        },
        success: {
          DEFAULT: '#16745A',
          soft: '#E6F1EC',
        },
        warning: {
          DEFAULT: '#B45309',
          soft: '#FBEED7',
        },
        danger: {
          DEFAULT: '#B91C1C',
          soft: '#FBE7E7',
        },
        // Legacy Kentucky blue scale — kept for backward compat
        kyblue: {
          DEFAULT: '#003DA5',
          50: '#E6EEF9',
          100: '#CCDCF3',
          200: '#99BAE7',
          300: '#6697DB',
          400: '#3375CF',
          500: '#003DA5',
          600: '#003184',
          700: '#002463',
          800: '#001842',
          900: '#000C21',
        },
      },
      boxShadow: {
        card: '0 1px 0 rgb(0 0 0 / 0.02), 0 1px 2px rgb(0 0 0 / 0.04)',
        lift: '0 1px 0 rgb(0 0 0 / 0.02), 0 8px 24px -8px rgb(26 31 46 / 0.12)',
      },
    },
  },
  plugins: [],
};

export default config;
