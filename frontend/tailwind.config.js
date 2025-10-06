/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Obsidian black tactical theme - MGS inspired
        'obsidian': {
          bg: '#050505',           // Pure obsidian background
          surface: '#0a0a0a',      // Surface panels
          elevated: '#0f0f0f',     // Elevated elements
          border: '#1a1a1a',       // Subtle borders
          hover: '#151515',        // Hover states
        },
        'tactical-text': {
          primary: '#e5e5e5',
          secondary: '#8a8a8a',
          muted: '#5a5a5a',
        },

        // Tactical LED colors - Full spectrum
        'led': {
          cyan: '#00d9ff',         // Status indicators
          blue: '#0ea5e9',         // Active processes
          purple: '#a855f7',       // AI/ML operations
          magenta: '#ec4899',      // Warnings
          red: '#ef4444',          // Errors/Critical
          orange: '#f97316',       // Alerts
          yellow: '#eab308',       // Warnings
          lime: '#84cc16',         // Success/Good
          green: '#10b981',        // Complete/Verified
          emerald: '#059669',      // Optimal
          teal: '#14b8a6',         // Active
          sky: '#0ea5e9',          // Info
        },

        // Tactical accent colors
        'tactical': {
          primary: '#00d9ff',      // Cyan primary
          secondary: '#a855f7',    // Purple secondary
          accent: '#14b8a6',       // Teal accent
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Consolas', 'Courier New', 'monospace'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['Rajdhani', 'Inter', 'sans-serif'],
      },
      borderRadius: {
        'tactical': '12px',
        'tactical-sm': '8px',
        'tactical-lg': '16px',
        'tactical-xl': '20px',
      },
      boxShadow: {
        'tactical': '0 0 20px rgba(0, 217, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.03)',
        'tactical-lg': '0 0 30px rgba(0, 217, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        'glow-cyan': '0 0 20px rgba(0, 217, 255, 0.4)',
        'glow-purple': '0 0 20px rgba(168, 85, 247, 0.4)',
        'glow-teal': '0 0 20px rgba(20, 184, 166, 0.4)',
        'glow-red': '0 0 20px rgba(239, 68, 68, 0.4)',
        'glow-green': '0 0 20px rgba(16, 185, 129, 0.4)',
        'inner-glow': 'inset 0 0 20px rgba(0, 217, 255, 0.1)',
      },
      backdropBlur: {
        'xs': '2px',
        'tactical': '8px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 217, 255, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 217, 255, 0.6)' },
        },
      },
    },
  },
  plugins: [],
}
