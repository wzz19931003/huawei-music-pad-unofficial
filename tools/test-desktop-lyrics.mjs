// Isolated NEW-source Electron acceptance. Never builds out/, packages, or reads a real profile.
// node tools/test-desktop-lyrics.mjs -- offline fixture DTOs, NOT provider/login/audio validation.
import assert from 'node:assert/strict';
import electron from 'electron';
import { _electron } from 'playwright-core';
import { build, createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = resolve(process.platform === 'win32' ? join(homedir(), 'AppData/Local/hermes/cache/scratch') : process.env.TMPDIR || '');
assert.ok(scratch && (process.platform === 'win32' || process.env.TMPDIR), 'explicit isolated scratch required');
await mkdir(scratch, { recursive: true });
const root = await mkdtemp(join(scratch, 'wmusic-desktop-lyrics-qa-'));
const runtime = join(root, 'runtime');
const profile = join(root, 'profile');
const evidence = join(root, 'evidence');
await Promise.all([mkdir(runtime), mkdir(profile), mkdir(evidence)]);
const report = { scope: 'isolated desktop-lyrics source / real Electron / offline fixture DTOs only; no account, provider or second Audio', passed: [], rendererErrors: [], root, profileRemoved: false, runtimeRemoved: false };
let instance;
let child;
let developmentServer;
let developmentUrl;
async function run(label, body) { await body(); report.passed.push(label); console.log(`PASS ${label}`); }
async function eventually(read, predicate, label, timeout = 6000) {
  const until = Date.now() + timeout;
  let value;
  do { value = await read(); if (predicate(value)) return value; await new Promise(resolve => setTimeout(resolve, 30)); } while (Date.now() < until);
  assert.fail(`${label}: ${JSON.stringify(value)}`);
}
const source = part => join(repo, part).replaceAll('\\', '/');
const external = id => id === 'electron' || id.startsWith('node:');
async function bundle(entry, output, format = 'es') {
  await build({ configFile: false, logLevel: 'error', build: { emptyOutDir: false, outDir: dirname(output), minify: false,
    lib: { entry, formats: [format], fileName: () => output.split(/[\\/]/).at(-1) }, rollupOptions: { external } } });
}
async function nativeInputStyle() {
  assert.equal(process.platform, 'win32', 'native click-through probe is Windows-specific');
  const handle = await instance.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('/desktop-lyrics.html'));
    const bytes = window.getNativeWindowHandle();
    return bytes.length >= 8 ? bytes.readBigUInt64LE().toString() : bytes.readUInt32LE().toString();
  });
  const probe = spawnSync('python3', ['-c', "import ctypes,json,sys; user32=ctypes.WinDLL('user32',use_last_error=True); get=user32.GetWindowLongPtrW; get.argtypes=[ctypes.c_void_p,ctypes.c_int]; get.restype=ctypes.c_ssize_t; style=get(ctypes.c_void_p(int(sys.argv[1])),-20); print(json.dumps({'clickThrough':bool(style & 0x20),'layered':bool(style & 0x80000),'topmost':bool(style & 0x8)}))", handle],
    { encoding: 'utf8', env: { ...process.env, TMPDIR: scratch, TMP: scratch, TEMP: scratch } });
  assert.equal(probe.status, 0, probe.error?.message || probe.stderr);
  return JSON.parse(probe.stdout);
}
try {
  assert.ok(await stat(source('src/renderer/desktop-lyrics.html')).then(() => true, () => false), 'missing isolated desktop-lyrics renderer entry');
  await bundle(source('src/main/desktop-lyrics.ts'), join(runtime, 'controller.mjs'));
  await bundle(source('src/preload/desktop-lyrics.ts'), join(runtime, 'desktop-lyrics.cjs'), 'cjs');
  const mainPreload = join(runtime, 'primary-preload.ts');
  await writeFile(mainPreload, `import { contextBridge } from 'electron'; import { createDesktopLyricsPublisher } from ${JSON.stringify(source('src/preload/desktop-lyrics.ts'))}; contextBridge.exposeInMainWorld('publisher', createDesktopLyricsPublisher());`);
  await bundle(mainPreload, join(runtime, 'primary-preload.cjs'), 'cjs');
  await build({ configFile: false, logLevel: 'error', root: source('src/renderer'), base: './', plugins: [react()],
    build: { outDir: join(runtime, 'renderer'), emptyOutDir: true, rollupOptions: { input: source('src/renderer/desktop-lyrics.html') } } });
  if (process.argv.includes('--dev')) {
    developmentServer = await createServer({ configFile: false, logLevel: 'error', root: source('src/renderer'), plugins: [react()],
      cacheDir: join(runtime, 'vite-cache'), server: { host: '127.0.0.1', port: 0 } });
    await developmentServer.listen();
    developmentUrl = `http://127.0.0.1:${developmentServer.httpServer.address().port}/desktop-lyrics.html`;
    report.mode = 'exact loopback development URL; strict CSP, no network/WS capability';
  } else report.mode = 'compiled local file entry';
  const mainHtml = join(runtime, 'primary.html');
  await writeFile(mainHtml, '<!doctype html><html><head><meta charset="utf-8"><title>桌面歌词离线隔离验收</title></head><body>独立测试主窗口，不加载应用或账号。</body></html>');
  const bootstrap = join(runtime, 'main.cjs');
  await writeFile(bootstrap, `const { app, BrowserWindow } = require('electron'); const { readFile, writeFile, rename } = require('node:fs/promises'); const { join } = require('node:path'); const { pathToFileURL } = require('node:url');
app.setPath('userData', ${JSON.stringify(profile)}); app.on('window-all-closed', () => {});
(async () => { await app.whenReady(); const { createDesktopLyricsController } = await import(pathToFileURL(${JSON.stringify(join(runtime, 'controller.mjs'))}).href);
const main = new BrowserWindow({ width: 500, height: 300, show: false, webPreferences: { preload: ${JSON.stringify(join(runtime, 'primary-preload.cjs'))}, sandbox: true, contextIsolation: true, nodeIntegration: false } });
globalThis.fixture = { main, recovery: true, failWrite: false, preloadPath: ${JSON.stringify(join(runtime, 'primary-preload.cjs'))} }; const store = join(app.getPath('userData'), 'desktop-lyrics-preferences.json');
globalThis.fixture.controller = await createDesktopLyricsController({ getMainWindow: () => main, mainDocumentUrl: pathToFileURL(${JSON.stringify(mainHtml)}).href,
entry: { htmlPath: ${JSON.stringify(join(runtime, 'renderer/desktop-lyrics.html'))}, preloadPath: ${JSON.stringify(join(runtime, 'desktop-lyrics.cjs'))}, developmentUrl: ${JSON.stringify(developmentUrl)} }, hasRecovery: () => globalThis.fixture.recovery,
storage: { read: async () => { try { return JSON.parse(await readFile(store, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } },
write: async value => { if (globalThis.fixture.failWrite) throw new Error('test-only secret not for renderer'); await writeFile(store + '.tmp', JSON.stringify(value)); await rename(store + '.tmp', store); } } });
await main.loadFile(${JSON.stringify(mainHtml)}); })().catch(error => { console.error(error); app.exit(1); });`);
  const env = { ...process.env, TMPDIR: scratch, TMP: scratch, TEMP: scratch };
  delete env.ELECTRON_RUN_AS_NODE;
  instance = await _electron.launch({ executablePath: electron, args: [`--user-data-dir=${profile}`, bootstrap], env, timeout: 30000 });
  child = instance.process();
  const main = await instance.firstWindow();
  assert.equal(resolve(await instance.evaluate(({ app }) => app.getPath('userData'))), profile);
  await main.waitForFunction(() => typeof window.publisher?.state === 'function');
  await main.context().addInitScript(() => {
    window.__lyricsAudioConstructions = 0;
    window.Audio = new Proxy(window.Audio, { construct() { window.__lyricsAudioConstructions++; throw new Error('No second Audio allowed'); } });
  });
  await instance.evaluate(() => globalThis.fixture.controller.setVisible(true));
  const overlay = await eventually(async () => (await instance.windows()).find(page => page.url().endsWith('/desktop-lyrics.html')), Boolean, 'overlay page created');
  overlay.on('pageerror', error => report.rendererErrors.push(error.message));
  await overlay.locator('.desktop-lyrics').waitFor();
  await run('real sandbox preload installs ONLY overlay methods; empty state boots without another Audio', async () => {
    const boundary = await overlay.evaluate(() => ({ node: typeof process, desktop: typeof window.desktop,
      api: Object.keys(window.desktopLyrics).sort(), audio: window.__lyricsAudioConstructions, rows: document.querySelectorAll('[data-lyric-row]').length }));
    assert.deepEqual(boundary, { node: 'undefined', desktop: 'undefined', api: ['hide', 'onState', 'state', 'updatePreferences'], audio: 0, rows: 2 });
    assert.match(await overlay.locator('.dl-current').textContent(), /尚未播放/);
    const native = await instance.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('/desktop-lyrics.html'));
      return { topmost: window.isAlwaysOnTop(), visible: window.isVisible(), focused: window.isFocused(), preferences: window.webContents.getLastWebPreferences() };
    });
    assert.equal(native.topmost, true); assert.equal(native.visible, true); assert.equal(native.focused, false);
    assert.equal(native.preferences.sandbox, true); assert.equal(native.preferences.contextIsolation, true);
    assert.equal(native.preferences.nodeIntegration, false); assert.equal(native.preferences.webSecurity, true);
    const computed = await overlay.evaluate(() => ({ body: getComputedStyle(document.body).backgroundColor, drag: getComputedStyle(document.querySelector('.dl-drag-handle')).webkitAppRegion,
      controls: getComputedStyle(document.querySelector('.dl-settings')).webkitAppRegion }));
    assert.equal(computed.body, 'rgba(0, 0, 0, 0)'); assert.equal(computed.drag, 'drag'); assert.equal(computed.controls, 'no-drag');
    await overlay.screenshot({ path: join(evidence, 'empty.png') });
  });
  await run('text-only translations, true word boundaries, pause/seek and stale freeze run through real IPC + React', async () => {
    const initial = await main.evaluate(() => window.publisher.state());
    const epoch = initial.data.snapshot.epoch;
    const value = { epoch, generation: 7, sequence: 1, track: { key: 'offline-audio-7', title: '<script>bad()</script>', artist: '离线边界样本' },
      clock: { positionMs: 1500, playing: false, rate: 1 }, current: { timeMs: 1000, text: '你好', translation: '<img src=x onerror=bad()>', segments: [{ timeMs: 1000, text: '你' }, { timeMs: 1500, text: '好' }] }, next: { timeMs: 3000, text: '来源下一行' } };
    const publish = async patch => {
      Object.assign(value, patch); const result = await main.evaluate(value => window.publisher.publish(value), value);
      assert.equal(result.ok, true, JSON.stringify(result));
    };
    await publish({});
    await eventually(() => overlay.locator('.dl-lines').getAttribute('data-active-word'), value => value === '1', 'source word boundary');
    assert.equal(await overlay.locator('.dl-current').textContent(), '你好');
    assert.equal(await overlay.locator('.dl-secondary').textContent(), '<img src=x onerror=bad()>');
    assert.equal(await overlay.locator('img, audio, video, iframe').count(), 0);
    assert.equal(await overlay.evaluate(() => window.bad), undefined);
    await overlay.screenshot({ path: join(evidence, 'source-translation-words.png') });
    await overlay.getByLabel('译文', { exact: true }).uncheck();
    await eventually(() => overlay.locator('.dl-secondary').textContent(), value => value === '来源下一行', 'translation toggle uses source next line');
    await publish({ sequence: 2, clock: { positionMs: 1400, playing: false, rate: 2 } });
    await eventually(() => overlay.locator('.dl-lines').getAttribute('data-active-word'), value => value === '0', 'backward seek');
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(await overlay.locator('.dl-lines').getAttribute('data-active-word'), '0', 'paused anchors never advance');
    await publish({ sequence: 3, clock: { positionMs: 1100, playing: true, rate: 2 } });
    await eventually(() => overlay.locator('.dl-lines').getAttribute('data-active-word'), value => value === '1', 'real rAF uses supplied rate and source boundary');
    await eventually(() => overlay.locator('.desktop-lyrics').getAttribute('data-stale'), value => value === 'true', 'extrapolation freezes after 1.5s');
    const clear = { epoch, generation: 7, sequence: 4, track: null, clock: null, current: null, next: null };
    assert.equal((await main.evaluate(value => window.publisher.publish(value), clear)).ok, true);
    await eventually(() => overlay.locator('.dl-current').textContent(), value => value === '尚未播放', 'clear erases previous text');
    assert.equal((await main.evaluate(value => window.publisher.publish(value), { ...value, sequence: 5 })).error.code, 'STALE');
  });
  await run('native lock/unlock recovery, hide-not-quit, bounded preference persistence and honest save errors', async () => {
    const range = overlay.getByLabel('字体大小', { exact: true });
    await range.focus(); await range.press('ArrowRight');
    await eventually(async () => (await overlay.evaluate(() => window.desktopLyrics.state())).data.preferences.fontSize, value => value === 33, 'font slider commit');
    const color = await overlay.evaluate(() => window.desktopLyrics.updatePreferences({ color: '#abcdef', highlightColor: '#aaff00' }));
    assert.equal(color.ok, true);
    await eventually(() => overlay.evaluate(() => getComputedStyle(document.querySelector('.dl-lines')).color), value => value === 'rgb(171, 205, 239)', 'font color');
    await overlay.getByRole('button', { name: '锁定桌面歌词', exact: true }).click();
    await eventually(async () => (await main.evaluate(() => window.publisher.state())).data.preferences.locked, Boolean, 'native lock');
    const native = await instance.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('/desktop-lyrics.html'));
      return { movable: window.isMovable(), focusable: window.isFocusable() };
    });
    assert.deepEqual(native, { movable: false, focusable: false });
    if (process.platform === 'win32') {
      report.lockedNativeStyle = await nativeInputStyle();
      assert.equal(report.lockedNativeStyle.clickThrough, true, 'Win32 WS_EX_TRANSPARENT must be set');
      assert.equal(report.lockedNativeStyle.topmost, true);
    }
    assert.equal(await overlay.locator('input').count(), 0);
    await overlay.screenshot({ path: join(evidence, 'locked-transparent.png'), omitBackground: true });
    await instance.evaluate(() => globalThis.fixture.controller.setLocked(false));
    if (process.platform === 'win32') {
      report.unlockedNativeStyle = await nativeInputStyle();
      assert.equal(report.unlockedNativeStyle.clickThrough, false, 'tray/main unlock must clear native click-through');
    }
    await overlay.getByLabel('字体大小', { exact: true }).waitFor();
    await instance.evaluate(() => { globalThis.fixture.failWrite = true; });
    const failed = await overlay.evaluate(() => window.desktopLyrics.updatePreferences({ fontSize: 34 }));
    assert.equal(failed.ok, false); assert.equal(failed.error.code, 'PERSISTENCE_WRITE_FAILED');
    await overlay.getByRole('alert').waitFor();
    assert.match(await overlay.getByRole('alert').textContent(), /保存失败/);
    assert.doesNotMatch(await overlay.locator('body').textContent(), /test-only secret/);
    await instance.evaluate(() => { globalThis.fixture.failWrite = false; });
    await overlay.evaluate(() => window.desktopLyrics.updatePreferences({ fontSize: 34 }));
    const persisted = JSON.parse(await readFile(join(profile, 'desktop-lyrics-preferences.json'), 'utf8'));
    assert.equal(persisted.fontSize, 34); assert.equal(persisted.color, '#abcdef');
    assert.equal(persisted.position && Number.isFinite(persisted.position.x), true);
    assert.deepEqual(Object.keys(persisted).sort(), ['color', 'fontSize', 'highlightColor', 'locked', 'position', 'showTranslation', 'version', 'visible', 'wordHighlight']);
    await overlay.getByRole('button', { name: '隐藏桌面歌词', exact: true }).click();
    await eventually(async () => (await main.evaluate(() => window.publisher.state())).data.shown, value => value === false, 'hide visibility');
    assert.equal(await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 2);
    await instance.evaluate(() => globalThis.fixture.controller.setVisible(true));
  });
  await run('real wrong-window/wrong-document guards, popup/fetch denial and main reload epoch reset', async () => {
    const before = await main.evaluate(() => window.publisher.state());
    await main.evaluate(() => { location.hash = 'untrusted-document'; });
    assert.equal((await main.evaluate(() => window.publisher.state())).error.code, 'DENIED');
    // Reload preserves hashes; restore the exact trusted document, then test a real reload.
    await main.goto(main.url().split('#')[0]);
    const restored = await main.evaluate(() => window.publisher.state());
    assert.equal(restored.ok, true);
    await main.reload();
    await main.waitForFunction(() => typeof window.publisher?.state === 'function');
    const after = await main.evaluate(() => window.publisher.state());
    assert.equal(after.ok, true, JSON.stringify(after));
    assert.ok(after.data.snapshot.epoch > restored.data.snapshot.epoch);
    assert.ok(after.data.snapshot.epoch > before.data.snapshot.epoch);
    assert.equal(after.data.snapshot.track, null);
    const alienCreated = instance.waitForEvent('window');
    await instance.evaluate(async ({ BrowserWindow }) => {
      const main = globalThis.fixture.main;
      const alien = new BrowserWindow({ show: false, webPreferences: { preload: globalThis.fixture.preloadPath, sandbox: true, contextIsolation: true, nodeIntegration: false } });
      globalThis.fixture.alien = alien; await alien.loadURL(main.webContents.getURL());
    });
    const alien = await alienCreated;
    await eventually(() => alien.evaluate(() => ({ url: location.href, publisher: typeof window.publisher })), value => value.publisher === 'object', 'same-document wrong-window preload');
    assert.equal((await alien.evaluate(() => window.publisher.state())).error.code, 'DENIED');
    await instance.evaluate(() => globalThis.fixture.alien.destroy());
    assert.equal(await overlay.evaluate(async () => { try { await fetch('https://example.invalid/should-never-connect'); return false; } catch { return true; } }), true);
    const windowsBefore = (await instance.windows()).length;
    await overlay.evaluate(() => { window.open('https://example.invalid/popup'); });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal((await instance.windows()).length, windowsBefore);
    assert.equal(await overlay.evaluate(() => window.__lyricsAudioConstructions), 0);
  });
  await run('sanitized preferences and native position survive a full isolated process restart; no track or clock is persisted', async () => {
    await instance.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('/desktop-lyrics.html'));
      window.setPosition(120, 140, false);
    });
    const expected = await eventually(async () => JSON.parse(await readFile(join(profile, 'desktop-lyrics-preferences.json'), 'utf8')),
      value => value.position?.x === 120 && value.position?.y === 140, 'real native move was persisted');
    await instance.evaluate(async () => { await globalThis.fixture.controller.dispose(); });
    await instance.close();
    if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => child.once('exit', resolve));
    instance = await _electron.launch({ executablePath: electron, args: [`--user-data-dir=${profile}`, bootstrap], env, timeout: 30000 });
    child = instance.process();
    await instance.firstWindow();
    // On an early two-window startup Playwright may not enumerate the hidden
    // primary page. Exercise its REAL preload in that exact native WebContents.
    const restored = await eventually(() => instance.evaluate(async () => {
      const main = globalThis.fixture?.main;
      if (!main || !globalThis.fixture.controller) return { ok: false, error: 'bootstrap pending' };
      try { return await main.webContents.executeJavaScript('window.publisher.state()'); }
      catch { return { ok: false, error: 'primary document pending' }; }
    }), value => value.ok === true, 'restarted primary preload state');
    assert.equal(restored.ok, true);
    assert.deepEqual(restored.data.preferences, expected);
    assert.equal(restored.data.snapshot.track, null);
    assert.equal(restored.data.snapshot.anchor, null);
    assert.equal(resolve(await instance.evaluate(({ app }) => app.getPath('userData'))), profile);
    const restartedOverlay = await eventually(async () => (await instance.windows()).find(page => page.url().endsWith('/desktop-lyrics.html')), Boolean, 'restored visible overlay');
    await restartedOverlay.locator('.desktop-lyrics').waitFor();
    assert.equal(await restartedOverlay.locator('.dl-current').textContent(), '尚未播放');
    await restartedOverlay.screenshot({ path: join(evidence, 'restored-preferences.png') });
    report.persistedKeys = Object.keys(expected).sort();
    report.electronVersion = await instance.evaluate(() => process.versions.electron);
  });
  assert.deepEqual(report.rendererErrors, []);
} finally {
  if (instance) {
    try { await instance.evaluate(async () => { await globalThis.fixture?.controller?.dispose(); }); } catch { /* retain original assertion */ }
    try { await instance.close(); } catch { child?.kill(); }
  }
  if (child && child.exitCode === null && child.signalCode === null) await new Promise(resolve => child.once('exit', resolve));
  if (developmentServer) await developmentServer.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  await rm(runtime, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  report.profileRemoved = await stat(profile).then(() => false, () => true);
  report.runtimeRemoved = await stat(runtime).then(() => false, () => true);
  await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.profileRemoved && report.runtimeRemoved, true);
}
