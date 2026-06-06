import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // Required for SSE streaming (/api/chat) — without this Vite buffers
        // the response and tokens never reach the browser in dev mode.
        headers: { 'X-Accel-Buffering': 'no' },
      },
    },
  },
});
