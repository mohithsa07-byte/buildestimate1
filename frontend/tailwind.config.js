/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      // Palette used by Hero.jsx and index.css
      colors: {
        ink: '#14212C',
        paper: '#F8F6F2',
        concrete: '#EDEAE2',
        steel: '#5B6B7A',
        blueprint: '#1F3A5F',
        safety: '#E2711D',
        safetyDeep: '#C25E12',
      },
      backgroundImage: {
        blueprintGrid:
          'linear-gradient(rgba(248,246,242,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(248,246,242,0.08) 1px, transparent 1px)',
      },
      backgroundSize: {
        grid: '32px 32px',
      },
    },
  },
  plugins: [],
}
