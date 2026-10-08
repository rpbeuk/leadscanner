import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ command }) => {
  const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '');

  const isProduction = command === 'build';
  const useGitHubPagesBase = env.VITE_DEPLOY_TARGET === 'github-pages' || isProduction;

  return {
    base: useGitHubPagesBase ? '/leadscanner/' : '/',
    plugins: [react(), !isProduction && basicSsl()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      https: !isProduction
    },
    preview: {
      host: '0.0.0.0',
      port: 4173
    }
  };
});
