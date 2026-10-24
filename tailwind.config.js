/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cherry:  '#EA3329',
        tangelo: '#ED5B3E',
        mustard: '#E88F00',
        pepper:  '#CC3300',
        mint:    '#189386',
        cream:   '#F4E7D0',
        smoked:  '#EDEAE6',
        coal:    '#262626',
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'Oswald', 'sans-serif'],
        script:  ['Pacifico', 'cursive'],
        body:    ['Sora', 'Inter', 'sans-serif'],
        sans:    ['Sora', 'Inter', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-hero': 'linear-gradient(135deg, #EA3329, #ED5B3E)',
        'gradient-warm': 'linear-gradient(180deg, #fdf6ed, #F4E7D0)',
        'gradient-soft': 'linear-gradient(135deg, #F4E7D0, #EDEAE6)',
      },
      boxShadow: {
        soft: '0 10px 30px -10px rgba(234,51,41,0.30)',
        card: '0 8px 24px -12px rgba(38,38,38,0.18)',
        glow: '0 0 40px rgba(237,91,62,0.40)',
      },
      // Una sola curva para todo lo que entra (la misma de --ease-out) y
      // tiempos cortos: el movimiento acompaña, no hace esperar.
      animation: {
        'fade-in':        'fadeIn 0.28s cubic-bezier(0.23,1,0.32,1) both',
        'scale-in':       'scaleIn 0.22s cubic-bezier(0.23,1,0.32,1) both',
        'slide-in-right': 'slideInRight 0.26s cubic-bezier(0.23,1,0.32,1) both',
        'sheet-up':       'sheetUp 0.28s cubic-bezier(0.23,1,0.32,1) both',
        'pop':            'pop 0.25s cubic-bezier(0.23,1,0.32,1) both',
        'bounce-soft':    'bounceSoft 2s infinite',
        'pulse-ring':     'pulseRing 1.5s cubic-bezier(0.4,0,0.6,1) infinite',
      },
      keyframes: {
        fadeIn:       { from: { opacity: '0', transform: 'translateY(8px)' },  to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn:      { from: { opacity: '0', transform: 'scale(0.96)' },      to: { opacity: '1', transform: 'scale(1)' } },
        slideInRight: { from: { opacity: '0', transform: 'translateX(24px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        sheetUp:      { from: { opacity: '0', transform: 'translateY(24px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pop:          { '0%': { transform: 'scale(0.6)', opacity: '0.4' }, '60%': { transform: 'scale(1.08)' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        bounceSoft:   { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        pulseRing:    { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.4' } },
      },
    },
  },
  plugins: [],
}
