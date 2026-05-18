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
      animation: {
        'fade-in':        'fadeIn 0.5s ease-out',
        'scale-in':       'scaleIn 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'bounce-soft':    'bounceSoft 2s infinite',
        'pulse-ring':     'pulseRing 1.5s cubic-bezier(0.4,0,0.6,1) infinite',
      },
      keyframes: {
        fadeIn:       { from: { opacity: '0', transform: 'translateY(8px)' },  to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn:      { from: { opacity: '0', transform: 'scale(0.95)' },      to: { opacity: '1', transform: 'scale(1)' } },
        slideInRight: { from: { opacity: '0', transform: 'translateX(24px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        bounceSoft:   { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        pulseRing:    { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.4' } },
      },
    },
  },
  plugins: [],
}
