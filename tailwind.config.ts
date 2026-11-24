import type { Config } from 'tailwindcss';

// Rampa neutra calda (tavolo di notte) e un solo accento oro pergamena.
// Rimappano slate/amber così tutti i componenti esistenti la ereditano.
const warm = {
  50: '#faf8f4',
  100: '#f5f1ea',
  200: '#efe9de',
  300: '#cdc6ba',
  400: '#aaa398',
  500: '#8a847a',
  600: '#5c5750',
  700: '#3a3732',
  800: '#262421',
  900: '#1c1a18',
  950: '#12110f',
};
const parchment = {
  50: '#fbf6e8',
  100: '#f7ecd0',
  200: '#f0dcae',
  300: '#e6c98a',
  400: '#d9b36c',
  500: '#c49a4f',
  600: '#a8803a',
  700: '#86652c',
  800: '#654c22',
  900: '#45341a',
  950: '#2a2010',
};

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        slate: warm,
        amber: parchment,
      },
      fontFamily: {
        rpg: ['Cinzel', 'serif'],
        sans: ['Outfit', 'sans-serif'],
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionDuration: {
        DEFAULT: '160ms',
      },
    },
  },
  plugins: [],
};

export default config;
