import { defineConfig } from 'vite';

export default defineConfig({
  // Root directory (where index.html lives)
  root: '.',
  
  // Dev server config
  server: {
    port: 3000,
    // Proxy API requests to Vercel dev
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // Better error handling
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('Proxy error:', err);
          });
        },
      },
    },
  },
  
  // Build config
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});