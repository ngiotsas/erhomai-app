import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LangProvider } from './i18n.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import './index.css';
import App from './App.jsx';

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
