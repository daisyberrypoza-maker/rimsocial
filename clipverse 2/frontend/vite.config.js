import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, API and uploads go to the Express server on port 3000
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
});
