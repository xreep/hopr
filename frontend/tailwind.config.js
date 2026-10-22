/** @type {import('tailwindcss').Config} */
// Hopr design system: road signage. A light, plain interface. Colour is functional:
// highway-sign green for routes and the main action, city-sign blue for links and
// live drivers, road-marking yellow for warnings, red for failures. Text is ink on white.
//
// Token names are semantic: `night` = surfaces (lightest to darkest), `ink` = text
// (strongest to faintest), `volt` = the route/primary green, `signal` = status colours.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        night: {
          950: '#F4F5F3', // page canvas
          900: '#FAFAF9', // sunken wells (inputs)
          850: '#FFFFFF', // panels
          800: '#FFFFFF', // raised panels
          700: '#DCE0E3', // hairlines, dividers
          600: '#C3C9CE' // strong borders
        },
        ink: {
          50: '#15191D', // primary text
          300: '#47515B', // secondary text
          400: '#5E6873', // muted text (>= 5.5:1 on white)
          500: '#8A929B' // placeholders, disabled
        },
        volt: {
          DEFAULT: '#0B6B3A', // highway-sign green
          soft: '#E7F2EC'
        },
        signal: {
          amber: '#8A5A00', // warning text (on white)
          coral: '#B4142B', // failure text (on white)
          sky: '#1F4E9C', // city-sign blue
          yellow: '#F2B705' // road-marking yellow (fills, not text)
        }
      },
      fontFamily: {
        display: ['Overpass', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Overpass', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      fontSize: {
        micro: ['0.75rem', { lineHeight: '1rem' }], // 12
        small: ['0.8125rem', { lineHeight: '1.125rem' }], // 13
        body: ['0.875rem', { lineHeight: '1.3125rem' }], // 14
        'body-lg': ['1rem', { lineHeight: '1.5rem' }], // 16
        h3: ['1.0625rem', { lineHeight: '1.5rem', letterSpacing: '-0.005em' }], // 17
        h2: ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em' }], // 22
        h1: ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.015em' }], // 28
        stat: ['1.75rem', { lineHeight: '2rem', letterSpacing: '-0.01em' }], // 28
        hero: ['2.75rem', { lineHeight: '3rem', letterSpacing: '-0.02em' }] // 44 (login only)
      },
      borderRadius: {
        chip: '4px',
        control: '6px',
        card: '8px',
        sheet: '12px'
      },
      boxShadow: {
        card: 'none',
        lift: '0 8px 24px rgb(16 24 32 / 0.12)'
      }
    }
  },
  plugins: []
}
