import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/turnos/',
  build: {
    outDir: 'dist-turnos',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'turnos.html'),
    },
  },
})
