import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The dev server proxies /api to the Spring Boot backend, so the browser sees one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: { '/api': { target: process.env.VITE_BACKEND ?? 'http://localhost:8080', changeOrigin: true } },
  },
})
