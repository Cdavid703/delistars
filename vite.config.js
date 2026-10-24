import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Id de este build: va dentro del código y en version.json. Si la página abierta
// tiene otro id que el publicado, AvisoVersion ofrece recargar.
const BUILD_ID = globalThis.process?.env?.BUILD_ID || new Date().toISOString()
const versionJson = {
  name: 'version-json',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionJson],
  define: { 'import.meta.env.VITE_BUILD_ID': JSON.stringify(BUILD_ID) },
  base: '/domicilios/',
  server: {
    port: 5173,
    // Solo en desarrollo: la API (/api/v1) la sirve el servidor de pruebas, así
    // buscar direcciones, cotizar rutas y los pedidos funcionan desde el portátil.
    proxy: {
      '/api': { target: globalThis.process?.env?.VITE_API_PROXY || 'https://pruebas.delistars.com', changeOrigin: true, secure: true },
    },
    hmr: {
      // Permite hot reload a través del gateway nginx
      host: 'localhost',
      protocol: 'ws',
    },
  },
})
