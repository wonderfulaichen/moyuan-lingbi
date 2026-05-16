
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './index.css';
import './styles/mobile.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { runMigration } from './shared/services/MigrationService';
import { bootstrapModules } from './shared/modules';

// 启动加载组件
function BootstrapApp() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        await runMigration();
        await bootstrapModules();
      } catch (err) {
        setError(err instanceof Error ? err.message : '初始化失败');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: 'var(--color-surface-base)' }}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p style={{ color: 'var(--color-text-primary)' }}>墨渊灵笔启动中...</p>
          <p className="text-sm mt-2" style={{ color: 'var(--color-text-muted)' }}>正在加载模块系统</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: 'var(--color-surface-base)' }}>
        <div className="text-center p-8 rounded-lg max-w-md" style={{ backgroundColor: 'var(--color-surface-elevated)' }}>
          <i className="fas fa-exclamation-triangle text-4xl mb-4" style={{ color: 'var(--color-error-400)' }}></i>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>启动失败</h2>
          <p className="mb-4" style={{ color: 'var(--color-text-secondary)' }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg font-medium"
            style={{ backgroundColor: 'var(--color-primary-400)', color: 'white' }}
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  return <App />;
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <BootstrapApp />
  </React.StrictMode>
);

if ('serviceWorker' in navigator && !(window as any).electronAPI) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
