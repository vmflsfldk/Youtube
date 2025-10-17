import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (!env.VITE_GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_ID) {
    env.VITE_GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID;
    process.env.VITE_GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID;
  }
  const proxyTarget = env.VITE_DEV_API_PROXY_TARGET || 'http://127.0.0.1:8787';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true
        }
      }
    }
  };
});
