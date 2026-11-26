import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves project sites from /<repository-name>/; local and other
// hosts continue to use the domain root.
const base = process.env.GITHUB_ACTIONS === 'true' ? '/rimsocial/' : '/';

// In dev, API and uploads go to the Express server on port 3000
// Short commit id of the build, shown at the bottom of the Your algorithm page so you can tell which version a device is running.
const build = process.env.VITE_GIT_COMMIT || process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || process.env.CF_WORKERS_COMMIT_SHA || 'local';

export default defineConfig({
  base,
  define: { __APP_BUILD__: JSON.stringify(build), 'import.meta.env.VITE_GIT_COMMIT': JSON.stringify(build) },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
});
