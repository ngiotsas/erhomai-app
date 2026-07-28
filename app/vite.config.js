import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), {
    name: 'fix-build-html',
    transformIndexHtml(html) {
      let result = html.replaceAll(' crossorigin', '');
      const headEnd = result.indexOf('</head>');
      const bodyEnd = result.indexOf('</body>');
      if (headEnd > 0 && bodyEnd > 0) {
        const head = result.substring(0, headEnd);
        const body = result.substring(headEnd, bodyEnd);
        const scripts = head.match(/<script[^>]*src="[^"]*"[^>]*><\/script>/g) || [];
        const links = head.match(/<link[^>]*href="[^"]*"[^>]*>/g) || [];
        let newHead = head;
        for (const s of scripts) newHead = newHead.replace(s, '');
        for (const l of links) newHead = newHead.replace(l, '');
        if (links.length || scripts.length) {
          result = newHead + result.substring(headEnd, bodyEnd) + '\n    ' + scripts.join('\n    ') + '\n    ' + links.join('\n    ') + '\n  ' + result.substring(bodyEnd);
        }
      }
      return result;
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
