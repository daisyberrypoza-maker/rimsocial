import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves project sites from /<repository-name>/; local and other
// hosts continue to use the domain root.
const base = process.env.GITHUB_ACTIONS === 'true' ? '/rimsocial/' : '/';

// In dev, API and uploads go to the Express server on port 3000
export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
});
