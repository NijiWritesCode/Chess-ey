/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#0a0e14',
          subtle: '#12171f',
          card: '#171d27',
          border: '#30363d',
          hover: '#1e2636',
        },
        ivory: {
          DEFAULT: '#f0f3f6',
          muted: '#8b949e',
          faint: '#484f58',
        },
        accent: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        chess: {
          brilliant: '#06b6d4',
          great: '#3b82f6',
          best: '#22c55e',
          excellent: '#84cc16',
          good: '#10b981',
          book: '#a855f7',
          inaccuracy: '#eab308',
          mistake: '#f97316',
          blunder: '#ef4444',
          missed: '#ec4899',
          forced: '#64748b'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      }
    },
  },
  plugins: [],
}
