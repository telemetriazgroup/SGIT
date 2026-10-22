import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const raiz = path.dirname(fileURLToPath(import.meta.url));
const icono = fs.readFileSync(path.resolve(raiz, 'public/favicon.svg'));

export default defineConfig({
  base: '/SGIT/',
  plugins: [
    react(),
    {
      name: 'entrada-sgit',
      configureServer(servidor) {
        servidor.middlewares.use((req, res, siguiente) => {
          const url = req.url ?? '/';
          if (url === '/favicon.ico' || url.startsWith('/favicon.ico?')) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'image/svg+xml');
            res.end(icono);
            return;
          }
          if (url === '/' || url.startsWith('/?')) {
            res.statusCode = 302;
            res.setHeader('Location', `/SGIT/${url.slice(1)}`);
            res.end();
            return;
          }
          siguiente();
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@sgit/shared': path.resolve(raiz, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 18004,
    strictPort: true,
    allowedHosts: ['ztrack.app', 'localhost', '127.0.0.1', '161.132.53.51'],
    proxy: {
      '/servicio': {
        target: process.env.API_INTERNO || 'http://api:18003',
        rewrite: (ruta) => ruta.replace(/^\/servicio/, '/SGIT'),
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
  },
});
