import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// E2E: abre o app real (precisa de `npm run build` antes). Roda em série, um app por vez.
export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  test: { environment: 'node', include: ['tests/e2e/**/*.e2e.test.ts'], testTimeout: 90_000, hookTimeout: 60_000, fileParallelism: false, maxConcurrency: 1 },
});
