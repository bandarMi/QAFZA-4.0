import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Both ports are env-configurable, and the proxy target follows PORT — otherwise
// changing the API port to dodge a conflict would silently break the dev UI.
const API_PORT = Number(process.env.PORT) || 4317;
const WEB_PORT = Number(process.env.WEB_PORT) || 5317;

export default defineConfig({
  plugins: [react()],
  server: {
    port: WEB_PORT,
    // `host: true` also binds the LAN interface, so the QR check-in page can be
    // opened from a phone on the same network.
    host: true,
    proxy: { '/api': { target: `http://localhost:${API_PORT}`, changeOrigin: true } },
  },
  build: { outDir: 'dist', sourcemap: false },
});
