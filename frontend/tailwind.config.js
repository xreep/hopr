/** @type {import('tailwindcss').Config} */
// "Night Dispatch" design system. One accent (volt lime) used sparingly: route lines,
// primary CTAs, active states, key numbers, status highlights. Never backgrounds,
// body text, large borders or secondary buttons.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        night: {
          950: '#070B14', // page background
          900: '#0B1220', // sunken wells (inputs, map backdrop)
          850: '#0E1626', // surface
          800: '#141E33', // raised surface
          700: '#1C2842', // hairlines, dividers
          600: '#2A3756' // disabled fills, strong borders
        },
        ink: {
          50: '#F4F7FB', // primary text
          300: '#A9B4C8', // secondary text
          400: '#8591A8', // muted text (>= 5.2:1 on every surface)
          500: '#76839C' // placeholders, disabled
        },
        volt: {
          DEFAULT: '#D4FF3F',
          soft: 'rgb(212 255 63 / 0.14)', // tint behind small active chips only
          glow: 'rgb(212 255 63 / 0.45)'
        },
        signal: {
          amber: '#F5B544', // warnings, at-risk windows
          coral: '#FF6B78', // failures, closures
          sky: '#7AA2FF' // secondary data series, info
        },
        // Legacy aliases kept until every page is migrated
        primary: '#1e3a8a',
        background: '#f8fafc',
        surface: '#ffffff',
        border: '#e2e8f0',
        muted: '#94a3b8',
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444'
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      // Modular scale, ratio 1.25 from a 16 px base
      fontSize: {
        micro: ['0.75rem', { lineHeight: '1rem' }], // 12
        small: ['0.8125rem', { lineHeight: '1.125rem' }], // 13
        body: ['0.875rem', { lineHeight: '1.25rem' }], // 14 (dense dashboard text)
        'body-lg': ['1rem', { lineHeight: '1.5rem' }], // 16
        h3: ['1.25rem', { lineHeight: '1.625rem', letterSpacing: '-0.01em' }], // 20
        h2: ['1.5625rem', { lineHeight: '1.875rem', letterSpacing: '-0.015em' }], // 25
        h1: ['1.9375rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em' }], // 31
        stat: ['2.4375rem', { lineHeight: '2.5rem', letterSpacing: '-0.03em' }], // 39 (KPI numbers)
        hero: ['3.8125rem', { lineHeight: '3.875rem', letterSpacing: '-0.035em' }] // 61 (login only)
      },
      borderRadius: {
        chip: '999px',
        control: '10px', // inputs, buttons
        card: '18px',
        sheet: '26px' // dialogs, bottom sheets
      },
      boxShadow: {
        card: 'inset 0 1px 0 rgb(255 255 255 / 0.04), 0 24px 48px -28px rgb(0 0 0 / 0.85)',
        lift: 'inset 0 1px 0 rgb(255 255 255 / 0.06), 0 30px 60px -24px rgb(0 0 0 / 0.9)',
        'volt-glow': '0 0 0 1px rgb(212 255 63 / 0.55), 0 10px 32px -10px rgb(212 255 63 / 0.55)',
        'volt-ring': '0 0 0 2px #070B14, 0 0 0 4px #D4FF3F'
      },
      keyframes: {
        'route-draw': { from: { strokeDashoffset: 'var(--route-length, 1000)' }, to: { strokeDashoffset: '0' } },
        'hop-in': {
          '0%': { opacity: '0', transform: 'scale(0.2) translateY(6px)' },
          '60%': { opacity: '1', transform: 'scale(1.25) translateY(-2px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' }
        },
        'pulse-ring': { '0%': { transform: 'scale(0.6)', opacity: '0.7' }, '100%': { transform: 'scale(1.9)', opacity: '0' } },
        'rise-in': { from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' }, to: { opacity: '1', transform: 'translateY(0) scale(1)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } }
      },
      animation: {
        'route-draw': 'route-draw 1.1s cubic-bezier(0.65, 0, 0.35, 1) forwards',
        'hop-in': 'hop-in 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.22, 1, 0.36, 1) infinite',
        'rise-in': 'rise-in 0.24s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.2s ease both'
      }
    }
  },
  plugins: []
}
