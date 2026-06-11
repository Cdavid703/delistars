/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Sora', 'DM Sans', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Oswald', 'system-ui', 'sans-serif'],
      },
      colors: {
        cherry: '#EA3329',
        tangelo: '#ED5B3E',
        mustard: '#E88F00',
        pepper: '#CC3300',
        mint: '#189386',
        cream: '#F4E7D0',
        'cream-deep': '#EDEAE6',
        coal: '#262626',
        primary: '#EA3329',
        'primary-dark': '#CC3329',
        secondary: '#EDEAE6',
        accent: '#E88F00',
        'muted-fg': '#666666',
        border: 'hsl(36 20% 80%)',
        input: 'hsl(36 25% 86%)',
      },
      boxShadow: {
        soft: '0 10px 30px -10px hsl(3 82% 54% / 0.30)',
        card: '0 8px 24px -12px hsl(0 0% 15% / 0.18)',
      },
      backgroundImage: {
        'gradient-hero': 'linear-gradient(135deg, #EA3329 0%, #ED5B3E 100%)',
      },
    },
  },
  plugins: [],
}
