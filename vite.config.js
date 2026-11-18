import { defineConfig } from 'vite';

export default defineConfig({
  root: 'frontend',
  publicDir: false,
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
