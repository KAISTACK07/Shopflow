/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development the browser talks only to Vite (port 5173), and Vite forwards /api to the backend.
// Same origin for the browser, so the backend needs no CORS configuration. In Docker, nginx does the same job.
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': apiTarget },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
