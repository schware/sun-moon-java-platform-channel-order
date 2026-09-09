import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Built into the Spring service's own jar (src/main/resources/static), so
// this app, its API and the /channel-order context-path are all one
// origin — no CORS needed anywhere, same reasoning as BO (ADR-0005).
export default defineConfig({
  plugins: [react()],
  base: '/channel-order/',
  build: {
    outDir: '../src/main/resources/static',
    emptyOutDir: true
  },
  server: {
    // The backend's context-path is /channel-order, so /channel-order/api/*
    // is already the real path — no rewrite needed, just forward it.
    proxy: {
      '/channel-order/api': 'http://localhost:8085'
    }
  }
})
