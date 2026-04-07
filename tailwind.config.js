/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#080c14',
          surface: '#0f1623',
          card: '#141e2e',
          border: '#1e2d42',
          accent: '#1a6bff',
          accentHover: '#2979ff',
          green: '#00e676',
          yellow: '#ffd600',
          orange: '#ff6d00',
          red: '#ff1744',
          text: '#e8edf5',
          muted: '#5a7090',
          dim: '#2a3f5f',
        }
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      }
    },
  },
  plugins: [],
};
