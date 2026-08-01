import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  // Relative production paths work both at a custom domain and at
  // https://<owner>.github.io/<repository>/ on GitHub Pages.
  base: mode === 'production' ? './' : '/',
  plugins: [react()],
  build: {
    target: ['es2020', 'safari14'],
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['./tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
}))
