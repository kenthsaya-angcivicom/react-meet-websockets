import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from "node:path"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
    hmr: {
      overlay: false,
    },
    headers: {
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': `frame-ancestors 'none'`,
    },
    allowedHosts: true,
    proxy: {
      '/api/telehealth': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/telehealth/, '/telehealth'),
      },
    },
  },
})
