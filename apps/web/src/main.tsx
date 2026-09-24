import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@polyhymnia/notation-react/styles.css';
import './app.css';
import { App } from './App.js';

// StrictMode deliberately: `layoutScore` is pure and the component never touches the DOM
// outside the reconciler, so the double invocation must be invisible (architecture.md).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
