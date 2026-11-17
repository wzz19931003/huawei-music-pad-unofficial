// Focused offline Windows renderer probe. Not packaged QA or live Huawei validation.
// Builds renderer/preload ONLY into scratch; no shared out/, release/ or real profile access.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'electron';
import { _electron as launcher } from 'playwright-core';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installPadFixtures } from './pad-qa-fixtures.mjs';
import { DEFAULT_SETTINGS } from '../src/main/settings.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = process.env.HERMES_QA_SCRATCH || (process.platform === 'win32' ? join(homedir(), 'AppData/Local/hermes/cache/scratch') : process.env.TMPDIR || tmpdir());
await mkdir(scratch, { recursive: true });
const output = await mkdtemp(join(scratch, 'wmusic-desktop-evidence-'));
const runtime = join(output, 'runtime');
const profile = join(runtime, 'profile');
const evidence = { scope: 'current renderer + existing preload in isolated Electron fixture host; offline only', output, passed: [], screenshots: [], liveHuawei: 'not exercised', packaged: false, errors: [] };
const inputFiles = ['src/renderer/App.tsx', 'src/renderer/PadNavigation.tsx', 'src/renderer/PadPlayer.tsx', 'src/renderer/PadScreens.tsx', 'src/renderer/QueuePanel.tsx', 'src/renderer/PadIcons.tsx', 'src/renderer/DesktopGlyphs.tsx', 'src/renderer/desktop-controls.ts', 'src/renderer/desktop.css', 'src/renderer/styles.css', 'src/renderer/pad.css', 'src/renderer/pad-screens.css', 'src/renderer/pad-mode-menu.css', 'src/renderer/lib/player.ts', 'src/preload/index.ts', 'tools/test-wmusic-desktop.mjs'];
const fingerprint = async () => Object.fromEntries(await Promise.all(inputFiles.map(async name => [name, createHash('sha256').update(await readFile(join(root, name))).digest('hex')])));
let instance;
let child;
try {
  await mkdir(profile, { recursive: true });
  evidence.inputs = await fingerprint();
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  await build({ configFile: false, root: join(root, 'src/renderer'), base: './', plugins: [react()], logLevel: 'warn',
    define: { __APP_VERSION__: JSON.stringify(pkg.version) }, build: { outDir: join(runtime, 'renderer'), emptyOutDir: true } });
  await build({ configFile: false, root, logLevel: 'warn', build: { outDir: join(runtime, 'preload'), emptyOutDir: true,
    lib: { entry: join(root, 'src/preload/index.ts'), formats: ['cjs'], fileName: () => 'index.cjs' }, rollupOptions: { external: ['electron'] } } });
  const bootstrap = join(runtime, 'fixture-main.cjs');
  await writeFile(bootstrap, `const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('node:path');
app.setPath('userData', ${JSON.stringify(profile)});
app.setPath('sessionData', ${JSON.stringify(join(profile, 'session'))});
app.commandLine.appendSwitch('disable-background-networking');
app.whenReady().then(() => {
 session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']}, (_details, callback) => callback({cancel:true}));
 const ok = data => ({ok:true,data});
 globalThis.__desktopSettings = ${JSON.stringify(DEFAULT_SETTINGS)};
 globalThis.__desktopQueue = null;
 ipcMain.handle('auth:status', () => ok({authenticated:false}));
 ipcMain.handle('settings:get', () => ok(globalThis.__desktopSettings));
 ipcMain.handle('settings:update', (_event, patch) => ok(globalThis.__desktopSettings = {...globalThis.__desktopSettings,...patch}));
 ipcMain.handle('queue:load', () => ok(globalThis.__desktopQueue));
 ipcMain.handle('queue:save', (_event, input) => { globalThis.__desktopQueue = input; return ok(undefined); });
 ipcMain.handle('updates:get', () => ok({status:'development',currentVersion:${JSON.stringify(pkg.version)},message:'离线渲染器探测，不连接更新服务'}));
 ipcMain.handle('window:maximized', () => false);
 ipcMain.handle('lyrics:cache-info', () => ok({entries:0,bytes:0,localEntries:0}));
 ipcMain.handle('fonts:list', () => ok([]));
 const window = new BrowserWindow({width:1320,height:840,frame:false,show:true,webPreferences:{preload:${JSON.stringify(join(runtime, 'preload/index.cjs'))},sandbox:true,contextIsolation:true,nodeIntegration:false}});
 window.setMenuBarVisibility(false);
 window.loadFile(${JSON.stringify(join(runtime, 'renderer/index.html'))});
});
app.on('window-all-closed', () => app.quit());
`);
  const env = { ...process.env, TMPDIR: scratch, TMP: scratch, TEMP: scratch };
  delete env.ELECTRON_RUN_AS_NODE;
  instance = await launcher.launch({ executablePath: electron, args: [bootstrap], cwd: root, env, timeout: 30000 });
  child = instance.process();
  const page = await instance.firstWindow({ timeout: 20000 });
  page.on('pageerror', error => evidence.errors.push(error.message));
  await page.locator('.desktop-app').waitFor();
  assert.equal(resolve(await instance.evaluate(({ app }) => app.getPath('userData'))), resolve(profile));
  const nav = page.getByRole('navigation', { name: '主导航', exact: true });
  const library = page.getByRole('navigation', { name: '音乐库导航', exact: true });
  const bar = page.getByRole('contentinfo', { name: '播放条' });
  assert.deepEqual(await nav.getByRole('button').allTextContents(), ['首页', '音乐厅', '现在就听', 'café听', '我的']);
  assert.deepEqual(await library.getByRole('button').allTextContents(), ['我的收藏', '我的歌单', '最近播放', '设置']);
  await nav.getByRole('button', { name: '现在就听', exact: true }).click();
  await page.locator('.pad-empty-player').waitFor();
  assert.equal(await bar.count(), 1);
  await bar.getByRole('button', { name: '收起播放页', exact: true }).click();
  evidence.passed.push('empty full-player access and persistent desktop navigation/bar before login');
  const fixture = await installPadFixtures(instance, page);
  await page.getByRole('button', { name: '继续最近播放', exact: true }).click();
  await page.waitForFunction(() => window.__padAudio?.length === 1 && !window.__padAudio[0].paused && window.__padAudio[0].readyState >= 1);
  const currentTime = await page.evaluate(() => window.__padAudio[0].currentTime);
  await nav.getByRole('button', { name: '音乐厅', exact: true }).click();
  await page.waitForTimeout(250);
  assert.ok(await page.evaluate(before => window.__padAudio.length === 1 && !window.__padAudio[0].paused && window.__padAudio[0].currentTime > before, currentTime));
  await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('player:command', 'next'));
  await page.waitForFunction(title => document.querySelector('.pad-mini-meta strong')?.textContent === title, fixture.tracks[1].title);
  await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('player:command', 'previous'));
  await page.waitForFunction(title => document.querySelector('.pad-mini-meta strong')?.textContent === title, fixture.tracks[0].title);
  await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('player:command', 'play-pause'));
  await page.waitForFunction(() => window.__padAudio[0].paused);
  evidence.passed.push('one real muted WAV Audio survives navigation; existing preload player:command reaches next/previous/toggle exactly once');
  const volume = bar.getByRole('slider', { name: '音量', exact: true });
  const audible = Number(await volume.inputValue());
  await volume.focus(); await volume.press('Home');
  await page.waitForFunction(() => window.__padAudio[0].volume === 0);
  await bar.getByRole('button', { name: '取消静音', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__padAudio[0].volume), audible);
  const seek = bar.getByRole('slider', { name: '播放进度', exact: true });
  await seek.focus(); await seek.press('Home'); await seek.press('ArrowRight');
  assert.ok(await page.evaluate(() => window.__padAudio[0].currentTime) > 0);
  evidence.passed.push('keyboard seek and volume/mute restore commit to native Audio');
  await nav.getByRole('button', { name: '现在就听', exact: true }).click();
  const trigger = bar.getByRole('button', { name: /^播放模式：/ });
  await trigger.focus(); await trigger.press('ArrowUp');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-mode')), 'heart', 'ArrowUp from the mode trigger must focus the last item');
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('.pad-player-screen').count(), 1, 'mode Escape must not close full player');
  await trigger.click(); await page.getByRole('menuitemradio', { name: '单曲循环', exact: true }).click();
  await page.getByRole('button', { name: '播放模式：单曲循环' }).waitFor();
  assert.equal(await page.locator('[role="menuitemradio"][aria-checked="true"]').getAttribute('data-mode'), 'one');
  evidence.passed.push('mode has accurate expanded/radio state, ArrowUp/selection/Escape');
  await bar.getByRole('button', { name: '播放队列', exact: true }).click();
  const queue = page.getByRole('complementary', { name: '播放队列', exact: true });
  await queue.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '关闭队列', 'keyboard users must enter the opened queue');
  await page.keyboard.press('Escape');
  await queue.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.pad-player-screen').count(), 1, 'queue Escape must preserve full-player access');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '播放队列');
  evidence.passed.push('queue open/close focuses controls and Escape dismisses only the queue');
  await nav.getByRole('button', { name: '首页', exact: true }).click();
  const song = page.getByRole('button', { name: `播放：${fixture.tracks[0].title}`, exact: true });
  await song.focus(); await song.press('Shift+F10');
  const songMenu = page.getByRole('menu', { name: `歌曲操作：${fixture.tracks[0].title}` });
  await songMenu.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), '立即播放');
  await page.keyboard.press('ArrowUp'); assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), '添加到播放队列');
  await page.keyboard.press('Home'); await page.keyboard.press('Escape');
  assert.equal(await songMenu.count(), 0); assert.ok(await song.evaluate(element => element === document.activeElement));
  await song.click({ button: 'right' }); await songMenu.waitFor();
  await songMenu.getByRole('menuitem', { name: '下一首播放', exact: true }).click();
  await song.click({ button: 'right' });
  const otherSong = page.getByRole('button', { name: `播放：${fixture.tracks[3].title}`, exact: true });
  await otherSong.click({ button: 'right' });
  await page.getByRole('menu', { name: `歌曲操作：${fixture.tracks[3].title}` }).waitFor();
  await page.keyboard.press('Escape');
  assert.ok(await otherSong.evaluate(element => element === document.activeElement), 'replacing an open song menu must update the focus-return origin');
  evidence.passed.push('Shift+F10/right-click reuse real song callbacks; focus/arrows/Home/Escape restore');
  // Hold the existing artist metadata IPC to exercise cancellation without a cloud call.
  await instance.evaluate(({ ipcMain }) => {
    ipcMain.handle('music:artist', () => new Promise(resolve => { globalThis.__desktopReleaseArtist = resolve; }));
  });
  await page.getByRole('button', { name: '心动模式', exact: true }).click();
  await page.getByRole('button', { name: '停止等待心动模式', exact: true }).waitFor();
  await page.getByRole('button', { name: '停止等待心动模式', exact: true }).click();
  await page.getByRole('status', { name: '心动模式状态', exact: true }).filter({ hasText: '已停止等待' }).waitFor();
  assert.equal(await bar.getByRole('button', { name: '播放模式：单曲循环', exact: true }).count(), 1);
  await instance.evaluate(({ ipcMain }) => {
    globalThis.__desktopReleaseArtist?.({ ok: true, data: { tracks: [], albums: [] } });
    ipcMain.removeHandler('music:artist');
    ipcMain.handle('music:artist', () => ({ ok: true, data: { tracks: [], albums: [] } }));
  });
  await page.getByRole('button', { name: '心动模式', exact: true }).click();
  await page.getByRole('status', { name: '心动模式状态', exact: true }).filter({ hasText: '没有找到' }).waitFor();
  assert.equal(await bar.getByRole('button', { name: '播放模式：单曲循环', exact: true }).count(), 1);
  evidence.passed.push('Home heart uses real selectMode/cancelHeart; cancellation and no candidates preserve actual mode/queue');
  await instance.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('music:favorites');
    ipcMain.handle('music:favorites', () => ({ ok: false, error: { kind: 'network', message: '离线夹具故障', retryable: true } }));
  });
  await page.getByRole('button', { name: '心动模式', exact: true }).click();
  await page.getByRole('status', { name: '心动模式状态', exact: true }).filter({ hasText: '读取收藏或相关歌曲失败' }).waitFor();
  assert.equal(await bar.getByRole('button', { name: '播放模式：单曲循环', exact: true }).count(), 1);
  await instance.evaluate(({ ipcMain }, tracks) => {
    ipcMain.removeHandler('music:favorites');
    ipcMain.handle('music:favorites', () => ({ ok: true, data: { tracks: tracks.filter(track => globalThis.__padFixture.favoriteIds.has(track.id)), nextStart: tracks.length, hasMore: false } }));
    ipcMain.removeHandler('music:artist');
    ipcMain.handle('music:artist', (_event, { id }) => ({ ok: true, data: { artist: { id, name: '离线关联夹具' }, tracks: [{ id: `desktop-related-${id}`, title: `关联夹具 ${id}`, artists: [{ id, name: '离线关联夹具' }], durationSeconds: 80, available: true }], albums: [] } }));
  }, fixture.tracks);
  await page.getByRole('button', { name: '心动模式', exact: true }).click();
  await page.getByRole('button', { name: '播放模式：心动模式', exact: true }).waitFor();
  await page.locator('.pad-player-screen').waitFor();
  const deadline = Date.now() + 5000;
  let heartQueue;
  while (Date.now() < deadline) {
    heartQueue = await instance.evaluate(() => globalThis.__desktopQueue?.tracks);
    if (heartQueue?.some(track => track.id.startsWith('desktop-related-'))) break;
    await page.waitForTimeout(50);
  }
  assert.ok(heartQueue?.length >= 2);
  heartQueue.forEach((track, index) => assert.equal(track.id.startsWith('desktop-related-'), index % 2 === 1));
  evidence.passed.push('Home heart failure is visible and keeps the old mode; successful existing selectMode opens full player and persists alternating fixture seed/related tracks');
  await nav.getByRole('button', { name: '首页', exact: true }).click();
  assert.deepEqual(await page.locator('.pad-home-features .pad-feature-copy strong').allTextContents(), ['现在就听', '每日30首', '新歌推荐', '心动模式', '我的收藏']);
  assert.equal(await page.getByRole('button', { name: '每日30首，未接入', exact: true }).getAttribute('aria-disabled'), 'true');
  assert.equal(await page.getByRole('button', { name: '新歌推荐，未接入', exact: true }).getAttribute('aria-disabled'), 'true');
  evidence.passed.push('Home order is exact; unimplemented daily/new-release entries remain explicitly unavailable');
  // Return to a settled normal listening state; do not screenshot transient test toasts.
  await bar.getByRole('button', { name: /^播放模式：/ }).click();
  await page.getByRole('menuitemradio', { name: '列表', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.toast') && !document.querySelector('.pad-heart-status'), null, { timeout: 6000 });
  if (await page.evaluate(() => window.__padAudio[0].paused)) await bar.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForFunction(() => !window.__padAudio[0].paused);
  evidence.geometry = [];
  for (const [width, height] of [[960, 640], [1320, 840], [1920, 1080]]) {
    await instance.evaluate(({ BrowserWindow }, [width, height]) => BrowserWindow.getAllWindows()[0].setContentSize(width, height), [width, height]);
    for (const tab of ['首页', '现在就听']) {
      await nav.getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(350);
      const result = await page.evaluate(() => {
        const box = selector => { const element = document.querySelector(selector); const rect = element?.getBoundingClientRect(); assertVisible: if (element && rect) { const style = getComputedStyle(element); if (style.display === 'none' || style.visibility === 'hidden') break assertVisible; return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom }; } return null; };
        const next = document.querySelector('.desktop-transport [aria-label="下一首"]');
        const path = document.querySelector('.pad-like [data-part="favorite-heart"]');
        const pause = document.querySelector('.pad-play-toggle [data-part="pause-bars"]');
        return { viewport: [innerWidth, innerHeight], sidebar: box('.desktop-sidebar'), stage: box('.stage'), bar: box('.desktop-playerbar'), title: box('.window-brand'), next: box('.desktop-transport [aria-label="下一首"]'), mode: box('.pad-mode-picker'), volume: box('.pad-volume-control'), modeSibling: next?.nextElementSibling?.classList.contains('pad-mode-picker'), nextStroke: getComputedStyle(next.querySelector('svg')).strokeWidth, heartStroke: path ? getComputedStyle(path).stroke : null, pauseStroke: pause ? getComputedStyle(pause).strokeWidth : null };
      });
      assert.deepEqual(result.viewport, [width, height]);
      assert.equal(result.bar.x, 0); assert.equal(result.bar.width, width); assert.equal(result.bar.bottom, height);
      assert.equal(result.sidebar.x, 0); assert.ok(Math.abs(result.sidebar.bottom - result.bar.y) <= 1);
      assert.ok(result.stage.x >= result.sidebar.right);
      assert.ok(Math.abs(result.title.x + result.title.width / 2 - width / 2) <= 1);
      assert.ok(result.modeSibling && result.mode.x >= result.next.right && result.mode.x - result.next.right < 20);
      assert.ok(result.next.width >= 44 && result.mode.height >= 44, 'desktop controls need the proposal’s 44px hit area without inflating glyph geometry');
      assert.ok(result.mode.right < width && result.volume.right <= width);
      assert.equal(result.nextStroke, '2.35px');
      if (tab === '首页') assert.equal(result.pauseStroke, '3.1px');
      if (result.heartStroke) assert.equal(result.heartStroke, 'none');
      evidence.geometry.push({ tab, ...result });
      const name = `${width}x${height}-${tab === '首页' ? 'home' : 'player'}.png`;
      await page.screenshot({ path: join(output, name) }); evidence.screenshots.push(name);
    }
  }
  assert.deepEqual(await page.evaluate(() => ({ node: typeof process, invoke: typeof window.desktop.invoke, resolve: typeof window.desktop.music.resolvePlayback })), { node: 'undefined', invoke: 'undefined', resolve: 'function' });
  assert.deepEqual(evidence.errors, []);
  assert.deepEqual(await fingerprint(), evidence.inputs, 'probe inputs changed during this isolated run');
  evidence.passed.push('minimum/normal/large desktop geometry and computed Next/Heart paint; no renderer Node or generic IPC');
  evidence.ok = true;
} catch (error) {
  evidence.ok = false; evidence.failure = error.stack;
  if (instance) { const page = await instance.firstWindow().catch(() => null); if (page) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {}); }
  process.exitCode = 1;
} finally {
  if (instance) await instance.close().catch(() => {});
  if (child && child.exitCode === null) {
    await new Promise(resolve => { const timer = setTimeout(resolve, 3000); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
    if (child.exitCode === null) child.kill();
  }
  await rm(runtime, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
  evidence.cleanup = { runtimeRemoved: await stat(runtime).then(() => false, () => true), childExited: !child || child.exitCode !== null || child.signalCode !== null };
  if (!evidence.cleanup.runtimeRemoved || !evidence.cleanup.childExited) { evidence.ok = false; process.exitCode = 1; }
  await writeFile(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ ...evidence, geometry: undefined, geometryFrames: evidence.geometry?.length ?? 0 }, null, 2));
}
