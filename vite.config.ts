import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  base: '/leadscanner/',
  plugins: [
    react(),
    basicSsl()
  ],
  server: {
    port: 5173,
    host: true
  }
});
