/* global __ERHOMAI_BUILD__ */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LangProvider } from './i18n.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import './index.css';
import App from './App.jsx';

// Build version, injected by Vite at build time (see vite.config.js).
// Visible in the console and in the HTML comment of index.html.
console.info(`[erhomai] build ${__ERHOMAI_BUILD__}`);
window.__ERHOMAI_BUILD__ = __ERHOMAI_BUILD__;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <LangProvider>
        <App />
      </LangProvider>
    </ErrorBoundary>
  </StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('[sw] registration failed:', err);
    });
  });
}
