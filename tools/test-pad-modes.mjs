// Real React + singleton native Audio acceptance, entirely synthetic/offline.
// Run after npm run build. No production debug hooks or real Huawei account.
import assert from 'node:assert/strict';
import electron from 'electron';
import { _electron } from 'playwright-core';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { installPadFixtures, tracks as baseTracks } from './pad-qa-fixtures.mjs';

assert.ok(process.env.TMPDIR, 'use the configured Hermes scratch directory, never a real profile');
const scratch = resolve(process.env.TMPDIR);
await mkdir(scratch, { recursive: true });
const profile = await mkdtemp(join(scratch, 'hw-pad-modes-'));
const packaged = Boolean(process.env.PAD_QA_EXECUTABLE);
const executablePath = process.env.PAD_QA_EXECUTABLE || electron;
const launchArgs = [`--user-data-dir=${profile}`, ...(packaged ? [] : ['out/main/index.js'])];
const report = { scope: `${packaged ? 'packaged Windows application' : 'development Electron'}; synthetic metadata + muted generated local WAV; no Huawei account/CDN`, executablePath, passed: [], networkAttempts: 0 };
let instance;
let child;
let page;
async function eventually(read, accept, label, timeout = 6000) {
  const deadline = Date.now() + timeout;
  let value;
  do {
    value = await read();
    if (accept(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 40));
  } while (Date.now() < deadline);
  assert.fail(`${label}: condition did not become true (${JSON.stringify(value)})`);
}
async function run(label, body) { await body(); report.passed.push(label); console.log(`PASS ${label}`); }
const readFixture = () => instance.evaluate(() => ({ resolved: [...globalThis.__modeFixture.resolved], pages: [...globalThis.__modeFixture.pages], artistCalls: globalThis.__modeFixture.artistCalls, searchCalls: globalThis.__modeFixture.searchCalls, pending: !!globalThis.__modeFixture.pending, loggedOut: globalThis.__modeFixture.loggedOut }));
const settings = () => page.evaluate(() => window.desktop.settings.get());
const queue = () => page.evaluate(() => window.desktop.queue.load());
const title = () => page.locator('.pad-player-info h1').textContent();
const navigation = () => page.getByRole('navigation', { name: '主导航' });
async function select(label) {
  await page.getByRole('button', { name: /^播放模式：/ }).click();
  const menu = page.getByRole('menu', { name: '选择播放模式' });
  await menu.waitFor({ state: 'visible' });
  await menu.getByRole('menuitemradio', { name: label, exact: true }).click();
}
async function historyQueue(index = 0) {
  await navigation().getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('button', { name: '打开最近播放', exact: true }).click();
  await page.locator('.track-row').nth(index).getByRole('button', { name: '播放', exact: true }).click();
  await page.locator('.pad-player-info h1').waitFor();
  await page.waitForFunction(() => window.__padAudio?.length === 1 && !window.__padAudio[0].paused);
}
async function next() {
  const before = (await readFixture()).resolved.length;
  const playingBefore = await page.evaluate(() => window.__modeEvents.playing);
  await page.getByRole('button', { name: '下一首', exact: true }).click();
  const result = await eventually(readFixture, value => value.resolved.length > before, 'manual next resolves actual playback');
  await page.waitForFunction(count => window.__modeEvents.playing > count && window.__padAudio[0].readyState >= 1, playingBefore);
  return result;
}
async function ended() {
  await page.waitForFunction(() => window.__padAudio[0].readyState >= 1 && Number.isFinite(window.__padAudio[0].duration) && window.__padAudio[0].duration > 0);
  const before = (await readFixture()).resolved.length;
  const endedBefore = await page.evaluate(() => window.__modeEvents.ended);
  const playingBefore = await page.evaluate(() => window.__modeEvents.playing);
  await page.evaluate(() => {
    const audio = window.__padAudio[0];
    assertNativeAudio(audio);
    function assertNativeAudio(audio) { if (!Number.isFinite(audio.duration) || audio.duration <= 0 || !audio.muted) throw new Error('muted native WAV is not ready'); }
    audio.currentTime = audio.duration - .15;
    void audio.play();
  });
  await page.waitForFunction(count => window.__modeEvents.ended > count, endedBefore, { timeout: 5000 });
  const result = await eventually(readFixture, value => value.resolved.length > before, 'native ended resolves actual playback');
  await page.waitForFunction(count => window.__modeEvents.playing > count && window.__padAudio[0].readyState >= 1, playingBefore);
  return result;
}
try {
  const env = { ...process.env, TMPDIR: scratch, TMP: scratch, TEMP: scratch };
  delete env.ELECTRON_RUN_AS_NODE;
  instance = await _electron.launch({ executablePath, args: launchArgs, env, timeout: 30000 });
  child = instance.process();
  page = await instance.firstWindow({ timeout: 20000 });
  await page.waitForLoadState('domcontentloaded');
  await page.locator('.pad-app').waitFor();
  assert.equal(resolve(await instance.evaluate(({ app }) => app.getPath('userData'))), profile);
  report.application = await instance.evaluate(({ app }) => ({ version: app.getVersion(), packaged: app.isPackaged }));
  assert.equal(report.application.packaged, packaged);
  if (packaged) assert.equal(report.application.version, process.env.PAD_QA_EXPECT_VERSION || JSON.parse(await readFile('package.json', 'utf8')).version);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.context().route(/^https?:/i, route => { report.networkAttempts++; return route.abort(); });
  await installPadFixtures(instance, page); // Read-only shared fixture helper.
  const initModeAudio = () => {
    const rate = 8000, count = rate * 80;
    const buffer = new ArrayBuffer(44 + count * 2), view = new DataView(buffer);
    const text = (offset, word) => [...word].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    text(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    text(36, 'data'); view.setUint32(40, count * 2, true);
    window.__modeWav = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
    window.__modeEvents = { ended: 0, playing: 0 };
    window.__padAudio ??= [];
    const Native = window.Audio;
    window.Audio = new Proxy(Native, { construct(target, args) {
      const audio = Reflect.construct(target, args); audio.muted = true;
      if (!window.__padAudio.includes(audio)) window.__padAudio.push(audio);
      audio.addEventListener('ended', () => window.__modeEvents.ended++);
      audio.addEventListener('playing', () => window.__modeEvents.playing++);
      return audio;
    } });
  };
  await page.addInitScript(initModeAudio);
  const favorites = Array.from({ length: 52 }, (_, index) => ({ ...baseTracks[0], id: `mode-saved-${index}`, title: `合成收藏 ${index}`, durationSeconds: 80 }));
  const discoveries = [0, 1].map(index => ({ ...baseTracks[0], id: `mode-new-${index}`, title: `合成相关新歌 ${index}`, durationSeconds: 80 }));
  const configureIpc = ({ ipcMain, app }, { favorites, discoveries, history }) => {
    const ok = data => ({ ok: true, data });
    const replace = (name, callback) => { ipcMain.removeHandler(name); ipcMain.handle(name, callback); };
    const state = globalThis.__modeFixture = { favorites, discoveries, history, kind: 'ready', pages: [], resolved: [], artistCalls: 0, searchCalls: 0, pending: null, loggedOut: false };
    replace('auth:status', () => ok({ authenticated: !state.loggedOut, displayName: '离线模式测试账号', persistence: 'memory-only' }));
    replace('auth:logout', () => {
      state.loggedOut = true;
      return new Promise(resolve => { state.finishLogout = () => resolve(ok(undefined)); });
    });
    replace('music:favorites', (_event, input = {}) => {
      const start = input.start || 0; state.pages.push(start);
      const rows = state.kind === 'no-favorites' ? [] : state.favorites.slice(start, start + 50);
      return ok({ tracks: rows, nextStart: start + rows.length, hasMore: start + rows.length < (state.kind === 'no-favorites' ? 0 : state.favorites.length) });
    });
    replace('music:favorites-summary', () => ok({ total: state.kind === 'no-favorites' ? 0 : state.favorites.length }));
    replace('music:history', () => ok({ tracks: state.history }));
    replace('music:favorite-state', (_event, { trackId }) => ok({ favorite: state.favorites.some(track => track.id === trackId) }));
    replace('music:artist', async (_event, { id }) => {
      state.artistCalls++;
      const response = ok({ artist: { id, name: '离线合成歌手' }, tracks: state.kind === 'no-candidates' ? [] : state.discoveries, albums: [] });
      if (state.kind === 'delayed') return new Promise(resolve => { state.pending = () => { state.pending = null; resolve(response); }; });
      return response;
    });
    replace('music:search', () => { state.searchCalls++; return ok({ tracks: [], nextStart: 0, hasMore: false }); });
    replace('music:resolve-playback', async (event, { trackId }) => {
      state.resolved.push(trackId);
      return ok({ url: await event.sender.executeJavaScript('window.__modeWav'), actualQuality: 'unknown', qualityEvidence: 'none', contentType: 'audio/wav' });
    });
    for (const action of ['state', 'check', 'download', 'install']) replace(`updates:${action}`, () => ok({ status: 'development', currentVersion: app.getVersion(), message: '离线测试未连接更新服务' }));
  };
  await instance.evaluate(configureIpc, { favorites, discoveries, history: baseTracks.slice(0, 4) });
  await page.reload();
  await page.locator('.pad-app').waitFor();
  await historyQueue();
  await run('four visible radio choices and keyboard selection preserve the singleton Audio', async () => {
    await page.getByRole('button', { name: /^播放模式：/ }).click();
    assert.deepEqual(await page.getByRole('menuitemradio').allTextContents().then(rows => rows.map(text => text.replace('✓', '').trim())), ['列表', '单曲循环', '随机播放', '心动模式']);
    await page.getByRole('menuitemradio', { name: '列表', exact: true }).focus();
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await page.getByRole('button', { name: '播放模式：单曲循环', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__padAudio.length), 1);
    assert.equal(await page.getByRole('slider', { name: '音量', exact: true }).isVisible(), true);
  });
  await run('manual next in single-repeat advances; real Audio ended replays the current track', async () => {
    await next(); assert.equal(await title(), baseTracks[1].title);
    const resolved = await ended(); assert.equal(resolved.resolved.at(-1), baseTracks[1].id);
    assert.equal(await title(), baseTracks[1].title);
  });
  await run('list wraps on native ended at the last track', async () => {
    await select('列表'); await historyQueue(3);
    await ended(); assert.equal(await title(), baseTracks[0].title);
  });
  await run('single-track list explicitly replays on manual next and native ended', async () => {
    await page.getByRole('button', { name: '更多播放选项' }).click();
    await page.getByRole('button', { name: '播放队列', exact: true }).click();
    await page.getByRole('button', { name: '清空待播', exact: true }).click();
    await page.getByRole('button', { name: '关闭队列' }).click();
    await next(); await ended(); assert.equal(await title(), baseTracks[0].title);
  });
  await run('shuffle exhausts each native playback cycle without duplicate tracks or boundary repeat', async () => {
    await historyQueue(); await select('随机播放');
    const first = [baseTracks[0].id];
    for (let index = 0; index < 3; index++) first.push((await next()).resolved.at(-1));
    assert.equal(new Set(first).size, 4);
    const second = [];
    for (let index = 0; index < 4; index++) second.push((await next()).resolved.at(-1));
    assert.equal(new Set(second).size, 4);
    assert.notEqual(first.at(-1), second[0]);
  });
  await run('heart performs paginated favorites and real artist discovery with strict favorite/new alternation', async () => {
    await instance.evaluate(() => { const state = globalThis.__modeFixture; state.kind = 'ready'; state.pages = []; state.artistCalls = 0; state.searchCalls = 0; });
    await select('心动模式');
    await page.getByRole('button', { name: '播放模式：心动模式', exact: true }).waitFor();
    assert.match(await page.getByRole('status', { name: '心动模式状态' }).innerText(), /交替播放/);
    const reads = await readFixture(); assert.deepEqual(reads.pages, [0, 50]);
    assert.ok(reads.artistCalls > 0 && reads.artistCalls + reads.searchCalls <= 8);
    await eventually(queue, value => value.ok && value.data?.tracks[0]?.id === favorites[0].id, 'heart queue persisted');
    const saved = (await queue()).data;
    assert.deepEqual(saved.tracks.map(row => row.id), [favorites[0].id, discoveries[0].id, favorites[1].id, discoveries[1].id]);
    const played = [await title()];
    for (let index = 0; index < 3; index++) { await next(); played.push(await title()); }
    assert.deepEqual(played, saved.tracks.map(row => row.title));
  });
  await run('heart and queue persist through the real settings store and a full Electron process restart', async () => {
    await eventually(settings, value => value.ok && value.data.playMode === 'heart', 'modern heart mode persisted');
    const stored = JSON.parse(await readFile(join(profile, 'settings.json'), 'utf8'));
    assert.equal(stored.data.playMode, 'heart');
    await eventually(queue, value => value.ok && value.data?.index === 3, 'last queue position persisted before restart');
    await instance.close();
    await eventually(async () => child.exitCode, value => value !== null, 'previous Electron process exited');
    report.restartPreviousExited = child.exitCode !== null;
    instance = await _electron.launch({ executablePath, args: launchArgs, env, timeout: 30000 });
    child = instance.process(); page = await instance.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.context().route(/^https?:/i, route => { report.networkAttempts++; return route.abort(); });
    assert.equal(resolve(await instance.evaluate(({ app }) => app.getPath('userData'))), profile);
    await page.locator('.pad-app').waitFor();
    await page.addInitScript(initModeAudio);
    await instance.evaluate(configureIpc, { favorites, discoveries, history: baseTracks.slice(0, 4) });
    await page.reload(); await page.locator('.pad-app').waitFor();
    await navigation().getByRole('button', { name: '现在就听', exact: true }).click();
    await page.getByRole('button', { name: '播放模式：心动模式', exact: true }).waitFor();
    await page.waitForFunction(() => window.__padAudio?.length === 1 && window.__padAudio[0].readyState >= 1);
    assert.equal(await page.evaluate(() => window.__padAudio[0].paused), true);
    assert.equal(await page.evaluate(() => window.__padAudio.length), 1);
    assert.equal(await title(), discoveries[1].title);
  });
  for (const [kind, message] of [['no-favorites', /没有可播放的收藏/], ['no-candidates', /没有找到相关的新歌/]]) {
    await run(`${kind} rejects heart without changing the old mode, track or queue`, async () => {
      await select('列表');
      await instance.evaluate((_electron, kind) => { globalThis.__modeFixture.kind = kind; }, kind);
      const before = await queue(), beforeTitle = await title(), resolved = (await readFixture()).resolved.length;
      await select('心动模式');
      await page.waitForFunction(() => document.querySelector('[aria-label="心动模式状态"]')?.getAttribute('aria-busy') === 'false');
      assert.match(await page.getByRole('status', { name: '心动模式状态' }).innerText(), message);
      assert.equal(await page.getByRole('button', { name: '播放模式：列表', exact: true }).count(), 1);
      assert.equal(await title(), beforeTitle);
      assert.deepEqual((await queue()).data.tracks.map(row => row.id), before.data.tracks.map(row => row.id));
      assert.equal((await readFixture()).resolved.length, resolved);
    });
  }
  await run('mode change cancels waiting and ignores a late artist IPC settlement', async () => {
    await instance.evaluate(() => { globalThis.__modeFixture.kind = 'delayed'; });
    await select('心动模式');
    await eventually(readFixture, state => state.pending, 'artist request pending');
    assert.equal(await page.getByRole('status', { name: '心动模式状态' }).getAttribute('aria-busy'), 'true');
    const before = await title();
    await select('随机播放');
    await instance.evaluate(() => globalThis.__modeFixture.pending());
    await page.waitForTimeout(150);
    assert.equal(await page.getByRole('button', { name: '播放模式：随机播放', exact: true }).count(), 1);
    assert.equal(await title(), before);
    assert.equal((await settings()).data.playMode, 'shuffle');
  });
  await run('logout immediately cancels heart waiting and discards a late artist IPC result', async () => {
    await select('心动模式');
    await eventually(readFixture, state => state.pending, 'artist pending before logout');
    const before = await queue(), resolved = (await readFixture()).resolved.length;
    await navigation().getByRole('button', { name: '我的', exact: true }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await eventually(readFixture, state => state.loggedOut, 'fixture logout IPC called');
    // Logout IPC is deliberately still pending: cancellation must happen at click,
    // not only after the account disappears from React state.
    assert.equal(await page.getByRole('status', { name: '心动模式状态' }).getAttribute('aria-busy'), 'false');
    assert.match(await page.getByRole('status', { name: '心动模式状态' }).innerText(), /停止等待|不会应用/);
    await instance.evaluate(() => globalThis.__modeFixture.pending());
    await page.waitForTimeout(180);
    assert.equal((await readFixture()).resolved.length, resolved);
    assert.equal((await settings()).data.playMode, 'shuffle');
    await instance.evaluate(() => globalThis.__modeFixture.finishLogout());
    await page.getByRole('status').filter({ hasText: '已退出登录。' }).waitFor();
    await navigation().getByRole('button', { name: '现在就听', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '播放模式：随机播放', exact: true }).count(), 1);
    assert.match(await page.getByRole('status', { name: '心动模式状态' }).innerText(), /停止等待|不会应用/);
    assert.deepEqual((await queue()).data.tracks.map(row => row.id), before.data.tracks.map(row => row.id));
    assert.equal((await readFixture()).resolved.length, resolved);
    assert.equal((await settings()).data.playMode, 'shuffle');
  });
  assert.deepEqual(errors, [], 'renderer exceptions');
  assert.equal(report.networkAttempts, 0, 'no external renderer requests');
} catch (error) {
  report.failure = error.stack || String(error); process.exitCode = 1;
} finally {
  await instance?.close().catch(() => undefined);
  if (child && child.exitCode === null) {
    child.kill();
    await eventually(async () => child.exitCode, value => value !== null, 'Electron process exited');
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 });
  await stat(profile).then(() => assert.fail('synthetic profile remains'), error => assert.equal(error.code, 'ENOENT'));
  report.profileRemoved = true; report.electronExited = !child || child.exitCode !== null;
  assert.equal(report.electronExited, true);
  report.passedCount = report.passed.length;
  await mkdir('release/qa', { recursive: true });
  await writeFile(`release/qa/pad-modes${packaged ? '-packaged' : ''}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
