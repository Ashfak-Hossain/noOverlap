import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The contracts package is compiled to CommonJS for the Node services that also consume it. Vite
  // treats a linked workspace package as source rather than a dependency, so it is named here to force
  // the same pre-bundling any other CommonJS dependency gets.
  optimizeDeps: { include: ['@no-overlap/contracts/realtime'] },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Socket.IO negotiates and then upgrades on its own path, which is not under /api and must not
      // be rewritten. `ws` is what lets the upgrade through — without it the handshake proxies fine
      // and the connection then silently falls back or fails.
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
