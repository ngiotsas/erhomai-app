import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

// Build ID: timestamp + short git hash, injected into index.html as an
// HTML comment (view-source) and into the JS bundle (console + window var)
// so it is always possible to verify which build is actually running.
function buildId() {
  let git = '';
  try {
    git = execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
  } catch {
    // not a git checkout
  }
  return `${new Date().toISOString()}${git ? ` git:${git}` : ''}`;
}

const BUILD_ID = buildId();

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'inject-build-id',
      transformIndexHtml(html) {
        return html.replace(
          '<!DOCTYPE html>',
          `<!DOCTYPE html>\n<!-- erhomai build: ${BUILD_ID} -->`,
        );
      },
    },
  ],
  define: {
    __ERHOMAI_BUILD__: JSON.stringify(BUILD_ID),
  },
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
