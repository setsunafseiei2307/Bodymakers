import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * ロジック層（src/lib）のユニットテストだけを対象にする。
 * DOM を使わないので environment は node のままでよく、起動が速い。
 */
export default defineConfig({
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/test/**/*.test.ts'],
  },
});
