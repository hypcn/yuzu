import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'example/',
        'example-old/',
        '**/*.config.{js,ts}',
        '**/types.ts',
      ],
    },
    include: ['src/**/*.{test,spec}.{js,ts}'],
  },
});
