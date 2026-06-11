import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/domicilios/',
  server: {
    port: 5173,
    hmr: {
      // Permite hot reload a través del gateway nginx
      host: 'localhost',
      protocol: 'ws',
    },
  },
})
