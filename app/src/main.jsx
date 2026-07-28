import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LangProvider } from './i18n.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import 'maplibre-gl/dist/maplibre-gl.css';
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
