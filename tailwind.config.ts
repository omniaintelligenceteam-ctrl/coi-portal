import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Kentucky blue accent for The Policy Place
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
    },
  },
  plugins: [],
};

export default config;
