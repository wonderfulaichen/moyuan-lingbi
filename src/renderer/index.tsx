import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './index.css';
import { runMigration } from './shared/services/MigrationService';

runMigration();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator && !(window as any).electronAPI) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
