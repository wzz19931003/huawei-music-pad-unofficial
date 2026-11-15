// Focused, offline Pad renderer acceptance. This is not Huawei account/CDN validation.
import assert from 'node:assert/strict';
import { installPadFixtures } from './pad-qa-fixtures.mjs';
import electron from 'electron';
import { _electron as launcher } from 'playwright-core';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const scratch = process.env.HERMES_QA_SCRATCH || (process.platform === 'win32'
  ? join(homedir(), 'AppData/Local/hermes/cache/scratch') : tmpdir());
await mkdir(scratch, { recursive: true });
const profile = await mkdtemp(join(scratch, 'hw-pad-qa-'));
const packaged = Boolean(process.env.PAD_QA_EXECUTABLE);
const executablePath = process.env.PAD_QA_EXECUTABLE || electron;
const output = resolve(packaged ? 'release/qa/pad-packaged' : 'release/qa/pad');
const evidence = { scope: `${packaged ? 'packaged Windows application' : 'development Electron'} / offline fixtures only`, executablePath, passed: [], screenshots: [], huaweiLogin: 'not exercised', huaweiPlayback: 'not exercised' };
let instance;
try {
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const env = { ...process.env, TMPDIR: scratch, TMP: scratch, TEMP: scratch };
  delete env.ELECTRON_RUN_AS_NODE;
  instance = await launcher.launch({ executablePath, args: [`--user-data-dir=${profile}`, ...(packaged ? [] : ['out/main/index.js'])], env, timeout: 30000 });
  const page = await instance.firstWindow({ timeout: 20000 });
  await page.waitForLoadState('domcontentloaded');
  const rendererErrors = [];
  page.on('pageerror', error => rendererErrors.push(error.message));
  evidence.firstFrame = await page.evaluate(() => ({ rootChildren: document.querySelector('#root')?.childElementCount, boot: !!document.querySelector('.boot-screen'), app: !!document.querySelector('.pad-app') }));
  await page.locator('.pad-app').waitFor({ state: 'visible', timeout: 15000 });
  evidence.rendererErrors = rendererErrors;
  assert.equal(resolve(await instance.evaluate(({ app }) => app.getPath('userData'))), resolve(profile), 'QA must not read a real user profile');
  evidence.application = await instance.evaluate(({ app }) => ({ version: app.getVersion(), packaged: app.isPackaged, name: app.getName() }));
  if (packaged) assert.equal(evidence.application.version, process.env.PAD_QA_EXPECT_VERSION || JSON.parse(await readFile('package.json', 'utf8')).version, 'packaged probe must not silently exercise a stale version');
  evidence.updateNetwork = packaged ? 'native state/get; check response replaced only for offline UI; real transport verified separately' : 'development updater disabled';
  if (packaged) await instance.evaluate(({ ipcMain, app }) => {
    ipcMain.removeHandler('updates:check');
    ipcMain.handle('updates:check', () => ({ ok: true, data: { status: 'development', currentVersion: app.getVersion(), message: '离线界面验收未连接更新服务' } }));
  });
  const navigation = page.getByRole('navigation', { name: '主导航' });
  assert.equal(await navigation.count(), 1, 'Pad primary navigation must exist before login');
  assert.deepEqual(await navigation.getByRole('button').allTextContents(), ['首页', '音乐厅', '现在就听', 'café听', '我的']);
  evidence.passed.push('five primary Pad tabs visible before authentication');
  await navigation.getByRole('button', { name: '现在就听', exact: true }).click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.pad-player-screen').count(), 1, 'empty player tab needs a real full-page state');
  assert.match(await page.locator('.pad-player-screen').innerText(), /选择一首歌/);
  assert.equal(await navigation.getAttribute('class').then(value => value.includes('is-centered')), true);
  await navigation.getByRole('button', { name: '首页', exact: true }).click();
  assert.equal(await page.locator('.pad-player-screen').count(), 0, 'navigation must dismiss player view without a reload');
  evidence.passed.push('empty now-playing route and centered navigation');
  await navigation.getByRole('button', { name: 'café听', exact: true }).click();
  assert.match(await page.locator('.main').innerText(), /听书|播客/, 'Pad content pages must be browseable before login, not replaced by the global login screen');
  await navigation.getByRole('button', { name: '首页', exact: true }).click();
  evidence.passed.push('café content state is available without pretending the account is logged in');
  await navigation.getByRole('button', { name: '我的', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '检查更新', exact: true }).count(), 1, 'Mine must expose a real update entry before Huawei login');
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
  await page.locator('.pad-update-panel').waitFor();
  const initialUpdate = await page.evaluate(() => window.desktop.updates.state());
  assert.equal(initialUpdate.ok, true);
  assert.notEqual(initialUpdate.data.status, 'downloaded', 'new profile cannot pretend an update is already downloaded');
  await navigation.getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '检查更新', exact: true }).count(), 1);
  await page.getByRole('button', { name: '关于', exact: true }).click();
  await page.locator('.pad-about-screen .pad-update-panel').waitFor();
  assert.equal(await page.getByRole('button', { name: '检查更新', exact: true }).count(), 1);
  await navigation.getByRole('button', { name: '首页', exact: true }).click();
  evidence.passed.push('Mine, Settings and About update entries use the allowlisted update bridge without requiring Huawei login');
  await instance.evaluate(({ ipcMain }) => {
    globalThis.__padLoginAttempts = 0;
    ipcMain.removeHandler('auth:login');
    ipcMain.handle('auth:login', () => {
      globalThis.__padLoginAttempts++;
      return { ok: false, error: { kind: 'unsupported', message: '离线验收：未连接华为登录服务', retryable: false } };
    });
  });
  await navigation.getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('button', { name: '登录华为账号', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '离线验收：未连接华为登录服务' }).waitFor();
  assert.equal(await instance.evaluate(() => globalThis.__padLoginAttempts), 1);
  await navigation.getByRole('button', { name: '首页', exact: true }).click();
  evidence.passed.push('account login entry calls the existing auth IPC and displays its error without pretending to log in');
  const boundary = await page.evaluate(() => ({ node: typeof process, genericIpc: typeof window.desktop.invoke, desktop: typeof window.desktop.music.resolvePlayback }));
  assert.deepEqual(boundary, { node: 'undefined', genericIpc: 'undefined', desktop: 'function' });
  evidence.passed.push('isolated renderer retains the existing preload boundary');
  const fixture = await installPadFixtures(instance, page);
  const playButton = page.locator('.main button').filter({ hasText: fixture.tracks[0].title }).first();
  await playButton.waitFor({ timeout: 10000 });
  await playButton.click();
  await page.locator('.pad-player-info h1').waitFor({ timeout: 10000 });
  await page.waitForFunction(() => window.__padAudio?.length === 1 && !window.__padAudio[0].paused);
  assert.equal(await page.locator('.pad-player-info h1').textContent(), fixture.tracks[0].title);
  const before = await page.evaluate(() => window.__padAudio[0].currentTime);
  await navigation.getByRole('button', { name: '音乐厅', exact: true }).click();
  await page.waitForTimeout(350);
  const continuing = await page.evaluate(() => ({ count: window.__padAudio.length, time: window.__padAudio[0].currentTime, paused: window.__padAudio[0].paused }));
  assert.equal(continuing.count, 1);
  assert.equal(continuing.paused, false);
  assert.ok(continuing.time > before, 'changing primary pages must not interrupt the existing Audio element');
  await navigation.getByRole('button', { name: '现在就听', exact: true }).click();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const seek = page.getByRole('slider', { name: '播放进度', exact: true });
  await seek.focus();
  await seek.press('Home');
  await seek.press('ArrowRight');
  await page.waitForTimeout(150);
  assert.ok(await page.evaluate(() => window.__padAudio[0].currentTime) > 0, 'keyboard seeking must commit to the actual Audio element');
  const bounds = await seek.boundingBox();
  await seek.click({ position: { x: bounds.width * .5, y: bounds.height / 2 } });
  await page.waitForTimeout(150);
  const sought = await page.evaluate(() => window.__padAudio[0].currentTime);
  assert.ok(sought > 30 && sought < 50, `pointer seek did not reach the middle: ${sought}`);
  evidence.passed.push('local WAV plays in the existing singleton Audio, survives page changes, and supports keyboard/pointer seek');
  const volumeSlider = page.getByRole('slider', { name: '音量', exact: true });
  assert.equal(await volumeSlider.count(), 1, 'volume control must be permanently outside more options');
  const audibleVolume = Number(await volumeSlider.inputValue());
  await volumeSlider.focus(); await volumeSlider.press('Home');
  await page.waitForFunction(() => window.__padAudio[0].volume === 0);
  await page.getByRole('button', { name: '取消静音', exact: true }).click();
  assert.ok(Math.abs(await page.evaluate(() => window.__padAudio[0].volume) - audibleVolume) < .001);
  const volumeBounds = await volumeSlider.boundingBox();
  await volumeSlider.click({ position: { x: volumeBounds.width / 2, y: volumeBounds.height / 2 } });
  const nativeVolume = await page.evaluate(() => window.__padAudio[0].volume);
  assert.ok(nativeVolume > .4 && nativeVolume < .6);
  evidence.passed.push('standalone volume supports keyboard, pointer, mute and restoration on the actual Audio element');
  await page.getByRole('button', { name: '取消收藏', exact: true }).click();
  await page.getByRole('button', { name: '收藏', exact: true }).waitFor();
  assert.deepEqual(await instance.evaluate(() => globalThis.__padFixture.writes), [{ trackId: fixture.tracks[0].id, favorite: false }]);
  evidence.passed.push('player favorite action reaches IPC once and reflects its returned state');
  await page.getByRole('button', { name: '更多播放选项' }).click();
  await page.getByRole('button', { name: '播放队列', exact: true }).click();
  await page.locator('.queue-panel').waitFor();
  const savedQueue = await page.evaluate(async () => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const result = await window.desktop.queue.load();
      if (result.ok && result.data?.tracks.length > 1) return result;
      await new Promise(done => setTimeout(done, 50));
    }
    throw new Error('Queue persistence did not settle');
  });
  assert.equal(savedQueue.ok, true);
  assert.ok(savedQueue.data?.tracks.length > 1, 'fixture playback must produce a nonempty multi-track queue');
  assert.deepEqual(await page.locator('.queue-panel .queue-title').allTextContents(), savedQueue.data.tracks.map(track => track.title), 'queue UI must match the actual persisted playback selection, not an assumed library total');
  evidence.queueCount = savedQueue.data.tracks.length;
  await page.getByRole('button', { name: '关闭队列' }).click();
  evidence.passed.push('existing queue panel remains reachable from Pad player');
  await navigation.getByRole('button', { name: '首页', exact: true }).click();
  for (let guard = 0; guard < 15; guard++) {
    const hearts = page.getByRole('button', { name: /^取消收藏：/ });
    const count = await hearts.count();
    if (!count) break;
    await hearts.first().click();
    await page.waitForFunction(previous => document.querySelectorAll('.pad-song-heart[aria-pressed="true"]').length < previous, count);
  }
  const addFavorite = page.getByRole('button', { name: `收藏：${fixture.tracks[0].title}`, exact: true });
  await addFavorite.waitFor();
  await addFavorite.click();
  await page.waitForTimeout(120);
  assert.deepEqual(await instance.evaluate(() => globalThis.__padFixture.writes.at(-1)), { trackId: fixture.tracks[0].id, favorite: true }, 'an unfilled heart must request adding, not always request deletion');
  await page.getByRole('button', { name: `取消收藏：${fixture.tracks[0].title}`, exact: true }).waitFor();
  evidence.passed.push('home favorites support both removing saved songs and adding from recent history');
  await navigation.getByRole('button', { name: '现在就听', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '取消收藏', exact: true }).count(), 1, 'home and full player must share the confirmed favorite state');
  evidence.passed.push('favorite state stays consistent between home and full player');
  await page.getByRole('slider', { name: '播放进度', exact: true }).focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.pad-player-screen').count(), 0, 'Escape must close player even when its range input is focused');
  evidence.passed.push('Escape closes the player from a focused seek control');
  const mineKey = navigation.getByRole('button', { name: '我的', exact: true });
  await mineKey.focus();
  await mineKey.press('Space');
  assert.equal(await page.locator('.pad-app').getAttribute('data-page'), 'mine', 'global playback shortcut must not steal native button activation');
  evidence.passed.push('keyboard activation of primary navigation is not stolen by playback shortcuts');
  // Prepare a dense, explicitly synthetic collection for visual review.
  await instance.evaluate(() => { globalThis.__padFixture.favoriteIds = new Set(Array.from({ length: 12 }, (_, index) => `pad-fixture-${index + 1}`)); });
  await navigation.getByRole('button', { name: '现在就听', exact: true }).click();
  await page.getByRole('button', { name: '取消收藏', exact: true }).click();
  await page.waitForTimeout(180);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  evidence.fixtureData = 'Synthetic account/library, test-only artwork (source described in coverArt), muted local WAV. Not Huawei service data.';
  evidence.geometry = [];
  await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 5000 });
  evidence.coverArt = process.env.PAD_QA_REFERENCE_ART ? 'QA-only crops from user-supplied reference screenshots' : 'generated test art';
  const sizes = [{ width: 1560, height: 1040 }, { width: 1320, height: 840 }, { width: 960, height: 640 }, { width: 1920, height: 1080 }];
  const tabs = ['首页', '音乐厅', '现在就听', 'café听', '我的'];
  const ids = ['home', 'hall', 'player', 'cafe', 'mine'];
  for (const size of sizes) {
    await instance.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), size);
    await page.waitForTimeout(180);
    const dimensions = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scale: devicePixelRatio }));
    const nativeBounds = await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentBounds());
    console.log('NATIVE_VIEWPORT_PROBE', JSON.stringify({ requested: size, dimensions, nativeBounds, playwrightViewport: page.viewportSize() }));
    assert.equal(dimensions.width, size.width, 'native viewport width differs from requested size');
    assert.equal(dimensions.height, size.height, 'native viewport height differs from requested size');
    for (let index = 0; index < tabs.length; index++) {
      await navigation.getByRole('button', { name: tabs[index], exact: true }).click();
      await page.waitForFunction(() => {
        const stage = document.querySelector('.pad-player-screen');
        return !stage || getComputedStyle(stage).opacity === '1';
      }, null, { timeout: 3000 });
      const result = await page.evaluate(() => {
        const box = selector => {
          const element = document.querySelector(selector);
          if (!element) return { exists: false };
          const rect = element.getBoundingClientRect();
          let visible = rect.width > 0 && rect.height > 0;
          for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
            const css = getComputedStyle(ancestor);
            if (css.display === 'none' || css.visibility === 'hidden' || Number(css.opacity) === 0) visible = false;
          }
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return { exists: true, visible, fits: rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
            clickable: !!hit && element.contains(hit), x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        };
        const player = document.querySelector('.pad-app').dataset.page === 'player';
        return { page: document.querySelector('.pad-app').dataset.page, width: innerWidth, height: innerHeight,
          navigation: box('.pad-navigation'), control: box(player ? '.pad-play-toggle.is-large' : '.pad-mini-player'),
          stage: player ? box('.pad-player-screen') : null,
          artwork: player ? box('img.pad-player-background') : null,
          noDocumentOverflow: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight };
      });
      assert.equal(result.page, ids[index]);
      if (result.stage) {
        assert.equal(result.stage.y, 32, 'player must start immediately below native window controls, without inherited section margin');
        assert.equal(result.stage.height + result.stage.y, result.height, 'player backdrop must cover all remaining content');
        if (result.artwork?.exists) assert.ok(Math.abs(result.artwork.width - result.artwork.height) < 1, 'album artwork must retain its square composition instead of zooming across the whole widescreen window');
      }
      for (const target of [result.navigation, result.control]) {
        assert.ok(target.exists && target.visible && target.fits && target.clickable, JSON.stringify(result));
      }
      assert.equal(result.noDocumentOverflow, true, JSON.stringify(result));
      evidence.geometry.push(result);
      if (size.width === 1560 || size.width === 960) {
        const filename = `${String(index + 1).padStart(2, '0')}-${ids[index]}-${size.width}.png`;
        await page.mouse.move(4, 4);
        await page.screenshot({ path: join(output, filename), timeout: 15000 });
        evidence.screenshots.push(filename);
      }
    }
  }
  await navigation.getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('button', { name: '打开我的收藏', exact: true }).click();
  await page.locator('.track-row').first().waitFor();
  assert.equal(await page.locator('.track-row').count(), 11);
  await navigation.getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('button', { name: '打开我的歌单', exact: true }).click();
  await page.locator('.card').filter({ hasText: fixture.playlists[0].title }).click();
  await page.locator('.track-row').first().waitFor();
  assert.equal(await page.locator('.pad-heading h1').textContent(), fixture.playlists[0].title);
  assert.equal(await page.locator('.track-row').count(), fixture.tracks.length);
  await navigation.getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('button', { name: '打开最近播放', exact: true }).click();
  assert.equal(await page.locator('.track-row').count(), fixture.tracks.length);
  evidence.passed.push('mine entries open actual favorites, playlist details and read-only history through existing IPC');
  const search = page.getByRole('textbox', { name: '搜索歌曲', exact: true });
  await search.fill('离线查询');
  await page.waitForFunction(() => document.querySelector('.pad-app').dataset.page === 'search');
  await page.locator('.track-row').first().waitFor();
  assert.equal(await page.locator('.track-row').count(), 4);
  assert.deepEqual(await instance.evaluate(() => globalThis.__padFixture.queries), ['离线查询']);
  await search.fill('取消中的搜索');
  await navigation.getByRole('button', { name: '我的', exact: true }).click();
  await page.waitForTimeout(450);
  assert.equal(await page.locator('.pad-app').getAttribute('data-page'), 'mine');
  assert.deepEqual(await instance.evaluate(() => globalThis.__padFixture.queries), ['离线查询']);
  evidence.passed.push('debounced search returns fixture results and navigation cancels a pending search');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('group', { name: '默认音质', exact: true }).getByRole('button', { name: '标准', exact: true }).click();
  await page.evaluate(async () => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const result = await window.desktop.settings.get();
      if (result.ok && result.data.quality === 'standard') return;
      await new Promise(done => setTimeout(done, 50));
    }
    throw new Error('Quality setting persistence did not settle');
  });
  const stored = JSON.parse(await readFile(join(profile, 'settings.json'), 'utf8'));
  assert.equal(stored.data.quality, 'standard');
  evidence.passed.push('Pad settings entry persists quality through the real isolated settings store');
  assert.deepEqual(rendererErrors, [], 'renderer exceptions during offline interaction');
  evidence.passed.push('all five Pad destinations fit and remain clickable at four native Electron window sizes');
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  evidence.failure = error.stack || String(error);
  console.error(evidence.failure);
  process.exitCode = 1;
} finally {
  const child = instance?.process();
  await instance?.close().catch(() => undefined);
  await rm(profile, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 });
  await stat(profile).then(() => assert.fail('QA profile still exists'), error => assert.equal(error.code, 'ENOENT'));
  evidence.profileRemoved = true;
  evidence.electronExited = !child || child.exitCode !== null;
  assert.equal(evidence.electronExited, true, 'QA Electron process must exit');
  await writeFile(join(output, 'verification.json'), JSON.stringify(evidence, null, 2));
}
