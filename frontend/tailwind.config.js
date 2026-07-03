/** @type {import('tailwindcss').Config} */
// "Studio" design system — a bright, tactile workshop for teaching models.
// Palette: BLACK + ORANGE + WHITE. Warm off-white canvas, white paper, warm
// near-black ink, and one vivid orange brand accent. Orange = good/active,
// warm red only for errors, warm neutrals for structure. No purple, no rainbow.
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: '#FBF9F6',        // app background (warm off-white)
        paper: '#FFFFFF',         // cards / surfaces
        raised: '#FCFAF7',        // slightly raised fills
        ink: {
          DEFAULT: '#17130E',     // primary text (warm near-black)
          soft: '#5A524A',        // secondary text
          mute: '#948B80',        // muted text / captions
        },
        line: {
          DEFAULT: '#EAE4DC',     // default borders
          soft: '#F3EEE7',        // hairline / subtle
          strong: '#DBD2C6',
        },
        // Brand accent — orange in all its useful shades.
        orange: {
          DEFAULT: '#FF6B1A',
          ink: '#C24E08',         // darker orange for text on white (AA)
          deep: '#E85A0C',
          soft: '#FFEBDD',        // tint background
          softer: '#FFF4EC',
        },
        // Near-black for strong/dark surfaces (buttons, headers, code).
        charcoal: {
          DEFAULT: '#211C16',
          soft: '#2E2820',
          line: '#3A342B',
        },
        // Minimal functional colors (kept warm so they sit with the brand).
        berry: { DEFAULT: '#D93A2B', soft: '#FBE4E1', ink: '#a52a1f' },  // error / danger
        amber: { DEFAULT: '#D98A1E', soft: '#FBEFD8', ink: '#996013' },  // warning / caution
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        xl2: '18px',
        '2xl': '22px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(23,19,14,0.04), 0 4px 16px rgba(23,19,14,0.05)',
        raised: '0 2px 6px rgba(23,19,14,0.06), 0 12px 32px rgba(23,19,14,0.09)',
        pop: '0 8px 40px rgba(23,19,14,0.16)',
        focus: '0 0 0 3px rgba(255,107,26,0.28)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'pop-in': { '0%': { opacity: '0', transform: 'scale(0.97)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        breathe: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.5' } },
      },
      animation: {
        'fade-up': 'fade-up 0.35s cubic-bezier(0.2,0.7,0.3,1) both',
        'pop-in': 'pop-in 0.2s ease-out both',
        breathe: 'breathe 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
