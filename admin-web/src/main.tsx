window.onerror = function (message, source, lineno, _colno, error) {
  const msg = "Component Error: " + message + " at " + source + ":" + lineno;
  console.error(msg, error);
};

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
