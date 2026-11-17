import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], build: { outDir: 'out/main' } },
  preload: {
    build: {
      outDir: 'out/preload', externalizeDeps: false,
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/index.ts'),
        output: { format: 'cjs', entryFileNames: 'index.cjs', inlineDynamicImports: true },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html'), 'desktop-lyrics': resolve(__dirname, 'src/renderer/desktop-lyrics.html') } },
    },
  },
});
