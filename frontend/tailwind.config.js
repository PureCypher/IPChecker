/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0a0a0a',
          surface: '#171717',
          border: '#262626',
          hover: '#1f1f1f',
          text: {
            primary: '#fafafa',
            secondary: '#a3a3a3',
            muted: '#525252',
          },
          accent: {
            blue: '#3b82f6',
            green: '#10b981',
            red: '#ef4444',
            yellow: '#f59e0b',
            purple: '#8b5cf6',
          },
        },
      },
      fontFamily: {
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
      },
    },
  },
  plugins: [],
};
