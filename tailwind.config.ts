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
          DEFAULT: '#5C8E97',
          deep: '#3D6B73',
          near: '#1F3A40',
          soft: '#EAF1F2',
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
        // Legacy kyblue — retoned to teal; key name kept for backward compat
        kyblue: {
          DEFAULT: '#5C8E97',
          50: '#EAF1F2',
          100: '#D5E3E6',
          200: '#ABC8CD',
          300: '#82ADB4',
          400: '#6E9BA3',
          500: '#5C8E97',
          600: '#4A767E',
          700: '#3D6B73',
          800: '#2D5258',
          900: '#1F3A40',
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
