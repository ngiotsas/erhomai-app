import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LangProvider } from './i18n.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import 'maplibre-gl/dist/maplibre-gl.css';
import './index.css';
import App from './App.jsx';

var s = document.getElementById('status');
function step(msg) { if (s) s.textContent = msg; }

step('1 imports');
try {
  var root = createRoot(document.getElementById('root'));
  step('2 createRoot');
  const el = document.getElementById('loading-msg');
  if (el) el.remove();
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <LangProvider>
          <App />
        </LangProvider>
      </ErrorBoundary>
    </StrictMode>
  );
  step('3 rendered');
} catch(e) {
  step('ERR: ' + (e && e.message || e));
  throw e;
}
