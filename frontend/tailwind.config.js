/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: 'rgb(var(--bg-primary) / <alpha-value>)',
          surface: 'rgb(var(--bg-card) / <alpha-value>)',
          border: 'rgb(var(--border) / <alpha-value>)',
          hover: 'rgb(var(--bg-card-hover) / <alpha-value>)',
          text: {
            primary: 'rgb(var(--text-primary) / <alpha-value>)',
            secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
            muted: 'rgb(var(--text-muted) / <alpha-value>)',
          },
          accent: {
            blue: 'rgb(var(--accent-alt) / <alpha-value>)',
            green: 'rgb(var(--accent) / <alpha-value>)',
            red: 'rgb(var(--danger) / <alpha-value>)',
            yellow: 'rgb(var(--warning) / <alpha-value>)',
            purple: 'rgb(var(--purple) / <alpha-value>)',
          },
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'Fira Code',
          'Consolas',
          'Monaco',
          'Courier New',
          'monospace',
        ],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 2s linear infinite',
        'grid-pulse': 'gridScroll 8s linear infinite',
      },
      keyframes: {
        gridScroll: {
          from: { backgroundPosition: '0 0, 0 0' },
          to: { backgroundPosition: '0 60px, 60px 0' },
        },
      },
    },
  },
  plugins: [],
};
