import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/vacantes/',
  build: {
    outDir: 'dist-vacantes',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'vacantes.html'),
    },
  },
})
