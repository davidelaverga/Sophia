import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev: the Studio calls the API same-origin through this proxy (no CORS, SSE streams through).
const api = process.env.SOPHIA_API_ORIGIN ?? 'http://127.0.0.1:8787'

export default defineConfig({
  plugins: [react()],
  server: {
    // IPv4 loopback only: reachable as localhost and as 127.0.0.1 (two origins with separate
    // storage, so two founders can sign in side by side), never exposed to the network.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: api, changeOrigin: false } },
  },
})
