import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    css: {
      transformer: 'lightningcss',
      lightningcss: {
        targets: {
          chrome: (49 << 16),
          android: (5 << 16),
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      target: 'es2015',
      cssTarget: 'chrome49',
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('hls.js')) return 'vendor-hls';
              if (id.includes('video.js')) return 'vendor-videojs';
              if (id.includes('lucide-react')) return 'vendor-icons';
              if (id.includes('react') || id.includes('react-dom') || id.includes('motion')) return 'vendor-core';
              return 'vendor-libs';
            }
          }
        }
      }
    },
    esbuild: {
      target: 'es2015',
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
