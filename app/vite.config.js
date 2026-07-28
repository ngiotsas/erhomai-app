import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), {
    name: 'strip-crossorigin',
    transformIndexHtml(html) {
      return html.replaceAll(' crossorigin', '');
    },
  }],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
});
