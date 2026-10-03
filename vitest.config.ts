import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], exclude: ['tests/e2e/**', 'node_modules/**'] },
});
