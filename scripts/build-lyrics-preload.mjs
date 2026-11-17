import { build } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Single-entry CJS avoids shared chunks, which sandboxed preloads cannot require. */
export async function buildDesktopLyricsPreload({ outDir = resolve(root, 'out/preload') } = {}) {
  await build({
    configFile: false,
    root,
    logLevel: 'warn',
    build: {
      outDir,
      emptyOutDir: false, // preserve the separately built primary index.cjs
      target: 'node22',
      minify: false,
      lib: {
        entry: resolve(root, 'src/preload/desktop-lyrics.ts'),
        formats: ['cjs'],
        fileName: () => 'desktop-lyrics.cjs',
      },
      rollupOptions: { external: ['electron'], output: { inlineDynamicImports: true } },
    },
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildDesktopLyricsPreload();
}
