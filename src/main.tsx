import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { applyBroadcastTheme, getStoredBroadcastTheme } from './lib/themeSystem.ts';
import './index.css';

// Initialize and apply Clean Realistic broadcast theme immediately
applyBroadcastTheme(getStoredBroadcastTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

