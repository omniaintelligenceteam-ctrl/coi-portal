import type { Config } from 'tailwindcss';

// Tailwind v4 reads tokens from the `@theme` block in app/globals.css.
// This file is kept for tooling that still expects a config (IDE plugins,
// editor IntelliSense) and to mirror the canonical token set as a fallback.
//
// IMPORTANT: keep this in sync with the @theme block in app/globals.css.
// The Statement design system retires Fraunces; .font-display now renders
// in Geist at display weight (see globals.css).
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
        serif: ['var(--font-geist)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
        display: ['var(--font-geist)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        caps: '0.12em',
        display: '-0.025em',
      },
      colors: {
        // Statement tokens — re-toned from Editorial Trust
        paper: {
          DEFAULT: '#F8F8F6',
          deep: '#F2F2EE',
        },
        canvas: '#F8F8F6',
        card: '#FFFFFF',
        ink: {
          DEFAULT: '#0F0F0E',
          muted: '#4A4A47',
          faint: '#8A8A85',
          mute: '#B8B7B0',
        },
        hairline: {
          DEFAULT: '#E7E6E0',
          cool: '#E3E3DF',
          strong: '#BCBBB4',
        },
        brand: {
          DEFAULT: '#0B2545',
          deep: '#061A36',
          near: '#214E89',
          soft: '#E7EDF5',
        },
        seal: {
          DEFAULT: '#B8923A',
          soft: '#F5ECD6',
          deep: '#8C6D27',
        },
        success: {
          DEFAULT: '#16A34A',
          soft: '#E2F4E9',
        },
        warning: {
          DEFAULT: '#B45309',
          soft: '#FEF0DA',
        },
        danger: {
          DEFAULT: '#DC2626',
          soft: '#FBE3E3',
        },
        // Legacy kyblue ramp — retoned to Sovereign Blue
        kyblue: {
          DEFAULT: '#0B2545',
          50: '#E7EDF5',
          100: '#CFDAEB',
          200: '#9BB4D4',
          300: '#6F8FBC',
          400: '#4870A0',
          500: '#214E89',
          600: '#163864',
          700: '#0B2545',
          800: '#061A36',
          900: '#03132A',
        },
      },
      boxShadow: {
        card: '0 1px 0 rgb(0 0 0 / 0.02), 0 1px 2px rgb(0 0 0 / 0.03)',
        lift: '0 1px 0 rgb(0 0 0 / 0.02), 0 8px 24px -8px rgb(11 37 69 / 0.10)',
      },
    },
  },
  plugins: [],
};

export default config;
