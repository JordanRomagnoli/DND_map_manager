import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        rpg: {
          dark: '#080a10',
          card: 'rgba(15, 20, 34, 0.88)',
          panel: '#101422',
          gold: '#d4af37',
          'gold-light': '#f5d77f',
          'gold-dark': '#997a15',
          accent: '#3b82f6',
        },
      },
      fontFamily: {
        rpg: ['Cinzel', 'serif'],
        sans: ['Outfit', 'sans-serif'],
      },
      boxShadow: {
        'gold-glow': '0 0 20px rgba(212, 175, 55, 0.25)',
        'gold-lg': '0 0 35px rgba(212, 175, 55, 0.35)',
        'blue-glow': '0 0 20px rgba(59, 130, 246, 0.25)',
      },
    },
  },
  plugins: [],
};

export default config;
