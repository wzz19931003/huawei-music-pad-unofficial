import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { loadConfigFromFile } from 'electron-vite';

test('both sandboxed preloads have an explicit standalone build chain and separate HTML pages', async () => {
  const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, resolve('electron.vite.config.ts'));
  const config = loaded.config;
  const preload = config.preload?.build;
  // v5.0.0 isolatedEntries uses TTY-only stdout methods even when stdout is piped.
  // Preserve that failed build and use separate single-entry builds, not a stdout shim.
  assert.notEqual(preload?.isolatedEntries, true, 'the selected build chain must also work with piped stdout');
  assert.equal(preload.externalizeDeps, false);
  assert.equal(preload.rollupOptions.output.format, 'cjs');
  assert.equal(preload.rollupOptions.output.entryFileNames, 'index.cjs');
  assert.equal(preload.rollupOptions.output.inlineDynamicImports, true);
  const pages = config.renderer?.build?.rollupOptions?.input;
  assert.ok(pages && typeof pages === 'object');
  assert.equal(resolve(pages.index), resolve('src/renderer/index.html'));
  assert.equal(resolve(pages['desktop-lyrics']), resolve('src/renderer/desktop-lyrics.html'));
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.match(pkg.scripts.build, /electron-vite build\s*&&\s*node scripts\/build-lyrics-preload\.mjs$/);
});

test('the actual isolated overlay-preload builder emits no relative or Node-only require', async () => {
  const module = await import('../scripts/build-lyrics-preload.mjs').catch(() => ({}));
  assert.equal(typeof module.buildDesktopLyricsPreload, 'function', 'the overlay needs its own sandbox-safe single-entry build');
  const scratch = process.env.HERMES_QA_SCRATCH || (process.platform === 'win32' ? join(homedir(), 'AppData/Local/hermes/cache/scratch') : process.env.TMPDIR || tmpdir());
  await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(join(scratch, 'wmusic-lyrics-preload-build-'));
  try {
    await module.buildDesktopLyricsPreload({ outDir: directory });
    const code = await readFile(join(directory, 'desktop-lyrics.cjs'), 'utf8');
    const required = [...code.matchAll(/\brequire\(["']([^"']+)["']\)/g)].map(match => match[1]);
    assert.ok(required.length > 0);
    assert.ok(required.every(name => name === 'electron'), `sandbox preload must not import ${required.join(',')}`);
    assert.match(code, /desktopLyrics/);
    assert.doesNotMatch(code, /exposeInMainWorld\(["']desktop["']/);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await assert.rejects(stat(directory), error => error.code === 'ENOENT');
  }
});
