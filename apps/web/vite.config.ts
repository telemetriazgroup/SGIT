import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const raiz = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/SGIT/',
  plugins: [
    react(),
    {
      name: 'entrada-sgit',
      configureServer(servidor) {
        servidor.middlewares.use((req, res, siguiente) => {
          const url = req.url ?? '/';
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
  },
  test: {
    environment: 'happy-dom',
    globals: true,
  },
});
