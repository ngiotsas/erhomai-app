import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LangProvider } from './i18n.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import 'maplibre-gl/dist/maplibre-gl.css';
import './index.css';
import App from './App.jsx';

var d = document.getElementById('root');
if (d) d.appendChild(document.createTextNode('loading...'));

try {
  createRoot(d).render(
    <StrictMode>
      <ErrorBoundary>
        <LangProvider>
          <App />
        </LangProvider>
      </ErrorBoundary>
    </StrictMode>
  );
} catch (e) {
  if (d) d.textContent = 'ERR: ' + (e && e.message || e);
}
