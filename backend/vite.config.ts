import { defineConfig } from 'vite';

export default defineConfig({
  // Configuration for vite-node
  optimizeDeps: {
    // Exclude Node.js built-in modules
    exclude: ['fsevents'],
  },
  ssr: {
    // Externalize Node.js modules
    external: ['express', 'cors', 'dotenv'],
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
