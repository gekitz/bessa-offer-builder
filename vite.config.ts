/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

const gitHash = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
})();
const buildTime = new Date().toISOString();

export default defineConfig({
  plugins: [react()],
  base: '/',
  define: {
    __GIT_HASH__: JSON.stringify(gitHash),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  build: {
    // Vendor chunks are stable and capped well under 200 kB each.
    // The only chunk that exceeds the default 500 kB warning is the
    // dynamically-imported @react-pdf/renderer (~1.6 MB raw) — that
    // one is intentional and lazy, so we raise the limit just enough
    // to silence the known case while still catching surprises.
    chunkSizeWarningLimit: 1700,
    rollupOptions: {
      output: {
        // Stable vendor chunks: when only app code changes the
        // hashes here stay the same and the user's browser keeps
        // them cached across deploys. The PDF stack (~600 KB) is
        // already split via the dynamic import in
        // src/pdf/generateOfferPdf.jsx, so we don't add it here.
        manualChunks: {
          'vendor-react':    ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-dnd':      ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          'vendor-icons':    ['lucide-react'],
          'vendor-qrcode':   ['qrcode'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    environmentOptions: {
      jsdom: { url: 'https://app.kitz.example/' },
    },
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx,js,jsx}'],
      exclude: [
        'src/**/*.test.*',
        'src/**/*.spec.*',
        'src/**/__tests__/**',
        'src/main.jsx',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
    },
  },
});
