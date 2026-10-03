import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const raiz = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
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
