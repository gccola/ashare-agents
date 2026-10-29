import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'admin',
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:8788'
    }
  },
  build: {
    outDir: '../dist/admin',
    emptyOutDir: true
  }
});
