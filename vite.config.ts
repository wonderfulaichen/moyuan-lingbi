import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  root: 'src/renderer',
  optimizeDeps: {
    exclude: ['node-llama-cpp']
  },
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api/ollama-proxy': {
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ollama-proxy/, ''),
      },
    },
  },
  build: {
    outDir: '../../build/renderer',
    emptyOutDir: true,
    sourcemap: true, // 启用 Source Map 便于调试
    rollupOptions: {
      external: ['node-llama-cpp']
    }
  }
})
