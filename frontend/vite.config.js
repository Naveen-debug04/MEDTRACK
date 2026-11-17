import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    'window.MEDTRACK_API_URL': JSON.stringify(process.env.VITE_MEDTRACK_API_URL || ''),
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
});
