// Maintained offline regression: real Electron/React, synthetic updater IPC only.
// Run: npm run build && node tools/test-pad-update-ui.mjs
// This NEVER calls a real updater transport, network download, or installer.
import assert from 'node:assert/strict';
import electron from 'electron';
import { _electron } from 'playwright-core';
import { mkdir, mkdtemp, rm, stat, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { installPadFixtures } from './pad-qa-fixtures.mjs';

assert.ok(process.env.TMPDIR, 'TMPDIR must identify the configured scratch root');
const scratch = resolve(process.env.TMPDIR);
const packaged = Boolean(process.env.PAD_QA_EXECUTABLE);
const executablePath = process.env.PAD_QA_EXECUTABLE || electron;
const report = { scope: `${packaged ? 'packaged Windows application' : 'development Electron'} / explicitly synthetic updater IPC / no real installation or download`, executablePath, passed: [], rendererErrors: [], networkAttempts: 0 };
let profile;
let instance;
let child;
let page;
async function eventually(read, accept, label, timeout = 6000) {
  const deadline = Date.now() + timeout;
  let value;
  do {
    value = await read();
    if (accept(value)) return value;
    await new Promise(done => setTimeout(done, 40));
  } while (Date.now() < deadline);
  assert.fail(`${label}: ${JSON.stringify(value)}`);
}
async function run(label, test) {
  await test();
  report.passed.push(label);
  console.log(`PASS ${label}`);
}
const fixture = () => instance.evaluate(() => {
  const state = globalThis.__updateUiFixture;
  return { native: state.native, calls: { ...state.calls } };
});
const navigation = () => page.getByRole('navigation', { name: '主导航' });
const panel = () => page.locator('.pad-update-panel');
async function openUpdates() {
  await navigation().getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
  await panel().waitFor();
}
try {
  await mkdir(scratch, { recursive: true });
  profile = await mkdtemp(join(scratch, 'hw-pad-update-ui-'));
  const env = { ...process.env, TMPDIR: scratch, TMP: scratch, TEMP: scratch };
  delete env.ELECTRON_RUN_AS_NODE;
  instance = await _electron.launch({ executablePath, args: [`--user-data-dir=${profile}`, ...(packaged ? [] : ['out/main/index.js'])], env, timeout: 30000 });
  child = instance.process();
  page = await instance.firstWindow({ timeout: 20000 });
  page.on('pageerror', error => report.rendererErrors.push(error.message));
  await page.context().route(/^https?:/i, route => { report.networkAttempts++; return route.abort(); });
  await page.locator('.pad-app').waitFor();
  assert.equal(resolve(await instance.evaluate(({ app }) => app.getPath('userData'))), profile, 'never use the real user profile');
  report.application = await instance.evaluate(({ app }) => ({ version: app.getVersion(), packaged: app.isPackaged }));
  assert.equal(report.application.packaged, packaged);
  if (packaged) assert.equal(report.application.version, process.env.PAD_QA_EXPECT_VERSION || JSON.parse(await readFile('package.json', 'utf8')).version);
  await instance.evaluate(({ ipcMain, app }) => {
    const ok = data => ({ ok: true, data });
    const reject = () => ({ ok: false, error: { kind: 'unsupported', code: 'UPDATE_NOT_READY', message: 'SYNTHETIC_PRIVATE_TRANSPORT_ERROR', retryable: false } });
    const replace = (name, callback) => { ipcMain.removeHandler(name); ipcMain.handle(name, callback); };
    const state = globalThis.__updateUiFixture = {
      native: { status: 'idle', currentVersion: app.getVersion(), message: '合成夹具：尚未检查更新' },
      calls: { state: 0, check: 0, download: 0, install: 0 },
    };
    replace('updates:get', () => {
      state.calls.state++;
      if (state.holdState) return new Promise(done => { state.finishState = () => { state.finishState = null; done(reject()); }; });
      return ok({ ...state.native });
    });
    replace('updates:check', () => {
      state.calls.check++;
      if (['downloaded', 'downloading', 'installing'].includes(state.native.status)) return reject();
      state.native = { ...state.native, status: 'available', version: '99.0.0', message: '合成夹具：发现更新（不是实际版本）' };
      return ok({ ...state.native });
    });
    replace('updates:download', () => {
      state.calls.download++;
      state.native = { ...state.native, status: 'downloaded', progress: 100, message: '合成夹具：模拟已验证下载（未下载任何文件）' };
      return ok({ ...state.native });
    });
    replace('updates:install', () => { state.calls.install++; return reject(); });
  });
  await page.reload();
  await page.locator('.pad-app').waitFor();
  await eventually(fixture, state => state.calls.state > 0, 'initial native state read');
  await run('reopening Mine updates preserves the native verified download without re-checking', async () => {
    await openUpdates();
    await page.getByRole('button', { name: '下载更新', exact: true }).waitFor();
    await page.getByRole('button', { name: '下载更新', exact: true }).click();
    await page.getByRole('button', { name: '重启并更新', exact: true }).waitFor();
    const before = await fixture();
    await openUpdates();
    await eventually(fixture, state => state.calls.state > before.calls.state || state.calls.check > before.calls.check, 'reopen reaches the native updater');
    // Only synchronous DOM predicates: this Playwright must not accept a truthy Promise.
    await page.waitForFunction(() => document.querySelector('.pad-update-panel')?.getAttribute('aria-busy') !== 'true');
    await page.waitForTimeout(150);
    assert.equal(await panel().getAttribute('data-update-status'), 'downloaded', 'navigation must not replace a verified native download with a renderer error');
    assert.equal(await page.getByRole('button', { name: '重启并更新', exact: true }).isEnabled(), true);
    const after = await fixture();
    assert.equal(after.native.status, 'downloaded');
    assert.equal(after.calls.check, before.calls.check, 'a verified download forbids a new check');
    assert.equal(after.calls.install, 0, 'navigation cannot install');
    assert.equal((await page.locator('body').innerText()).includes('SYNTHETIC_PRIVATE_TRANSPORT_ERROR'), false);
  });
  await run('queue-save failure keeps the verified download, exposes a safe action error, and never installs', async () => {
    // Shared fixture supplies only synthetic metadata and a muted generated WAV.
    const music = await installPadFixtures(instance, page);
    await navigation().getByRole('button', { name: '我的', exact: true }).click();
    await page.getByRole('button', { name: '打开最近播放', exact: true }).click();
    await page.locator('.track-row').first().getByRole('button', { name: '播放', exact: true }).click();
    await page.waitForFunction(() => window.__padAudio?.length === 1 && !window.__padAudio[0].paused && window.__padAudio[0].readyState >= 1);
    await eventually(() => page.evaluate(() => window.desktop.queue.load()), value => value.ok && value.data?.tracks.length > 0, 'real isolated autosave settled before failure injection');
    await instance.evaluate(({ ipcMain }) => {
      const state = globalThis.__updateUiFixture;
      state.saveFails = true;
      state.calls.queueSave = 0;
      state.events = [];
      ipcMain.removeHandler('queue:save');
      ipcMain.handle('queue:save', (_event, input) => {
        state.calls.queueSave++;
        state.lastQueue = input;
        const finish = () => {
          state.events.push(state.saveFails ? 'save-failed' : 'save-succeeded');
          return state.saveFails
            ? { ok: false, error: { kind: 'storage', message: 'SYNTHETIC_PRIVATE_QUEUE_ERROR', retryable: true } }
            : { ok: true, data: undefined };
        };
        if (state.holdSave) return new Promise(done => { state.finishSave = () => { state.finishSave = null; done(finish()); }; });
        return finish();
      });
    });
    await openUpdates();
    const before = await fixture();
    await page.getByRole('button', { name: '重启并更新', exact: true }).click();
    await eventually(fixture, state => state.calls.queueSave > before.calls.queueSave, 'explicit pre-install queue save');
    await page.waitForTimeout(150);
    assert.equal(await panel().getAttribute('data-update-status'), 'downloaded', 'failed queue persistence must not revoke native verified permission');
    await panel().getByRole('alert').filter({ hasText: /更新操作未完成|进度未能保存/ }).waitFor();
    assert.equal(await page.getByRole('button', { name: '重启并更新', exact: true }).isEnabled(), true, 'explicit install retry remains reachable');
    assert.equal((await fixture()).calls.install, 0, 'installer IPC is forbidden when save fails');
    assert.equal((await fixture()).native.status, 'downloaded');
    report.queueSaveFailure = { nativeStatus: (await fixture()).native.status, installCalls: (await fixture()).calls.install };
    const saved = await instance.evaluate(() => globalThis.__updateUiFixture.lastQueue);
    assert.equal(saved.tracks[0].id, music.tracks[0].id);
    assert.ok(saved.positionSeconds >= 0);
    assert.equal(await page.evaluate(() => window.__padAudio[0].paused), false, 'failed persistence must not stop playback');
    assert.equal((await page.locator('body').innerText()).includes('SYNTHETIC_PRIVATE_QUEUE_ERROR'), false);
  });
  await run('pending save blocks duplicate actions; native install failure still offers explicit retry after save success', async () => {
    await instance.evaluate(({ ipcMain }) => {
      const state = globalThis.__updateUiFixture;
      state.saveFails = false;
      state.holdSave = true;
      state.events = [];
      ipcMain.removeHandler('updates:install');
      ipcMain.handle('updates:install', () => {
        state.calls.install++;
        state.events.push('install');
        state.native = { ...state.native, status: 'error', errorCode: 'UPDATE_INSTALL_FAILED', message: '合成夹具：安装失败，可再次确认重试' };
        return { ok: true, data: { ...state.native } };
      });
    });
    const before = await fixture();
    await page.getByRole('button', { name: '重启并更新', exact: true }).click();
    await eventually(fixture, state => state.calls.queueSave > before.calls.queueSave, 'pre-install save is pending');
    assert.equal(await page.getByRole('button', { name: '重启并更新', exact: true }).isEnabled(), false, 'do not offer another install while saving progress');
    assert.equal((await fixture()).calls.install, 0, 'waiting for save cannot dispatch install');
    const pending = await fixture();
    await openUpdates();
    await page.waitForTimeout(150);
    const reopened = await fixture();
    assert.deepEqual(reopened.calls, pending.calls, 'busy navigation cannot start a check, refresh, or duplicate install');
    await instance.evaluate(() => globalThis.__updateUiFixture.finishSave());
    await page.getByRole('button', { name: '重试安装', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '重试安装', exact: true }).isEnabled(), true);
    assert.deepEqual(await instance.evaluate(() => globalThis.__updateUiFixture.events), ['save-succeeded', 'install']);
    assert.equal(await panel().getAttribute('data-update-status'), 'error', 'do not synthesize downloaded after native install failure');
    assert.equal((await fixture()).native.errorCode, 'UPDATE_INSTALL_FAILED');
    assert.equal(await panel().getByRole('alert').count(), 1, 'successful save clears the old local error; only native error remains');
    const failed = await fixture();
    await openUpdates();
    await eventually(fixture, state => state.calls.state > failed.calls.state, 'reopen refreshes the failed native install state');
    await page.getByRole('button', { name: '重试安装', exact: true }).waitFor();
    assert.equal((await fixture()).calls.check, failed.calls.check, 'native install retry permission forbids re-checking');
    await instance.evaluate(() => { globalThis.__updateUiFixture.holdSave = false; });
    await page.getByRole('button', { name: '重试安装', exact: true }).click();
    await eventually(fixture, state => state.calls.install === 2, 'one explicit authorized install retry');
    await page.waitForFunction(() => document.querySelector('.pad-update-panel')?.getAttribute('aria-busy') !== 'true');
    assert.deepEqual(await instance.evaluate(() => globalThis.__updateUiFixture.events), ['save-succeeded', 'install', 'save-succeeded', 'install']);
    assert.equal(await page.getByRole('button', { name: '重试安装', exact: true }).isEnabled(), true);
    report.installRetry = { installCalls: (await fixture()).calls.install, eventOrder: await instance.evaluate(() => globalThis.__updateUiFixture.events) };
  });
  await run('reopening native checking, downloading, or installing only refreshes state and never checks again', async () => {
    for (const status of ['checking', 'downloading', 'installing']) {
      const before = await fixture();
      await instance.evaluate((_electron, status) => {
        const state = globalThis.__updateUiFixture;
        state.native = { ...state.native, status, errorCode: undefined, progress: 42, message: `合成夹具：${status}` };
      }, status);
      await openUpdates();
      await eventually(() => panel().getAttribute('data-update-status'), actual => actual === status, `native ${status} shown`);
      await page.waitForFunction(() => document.querySelector('.pad-update-panel')?.getAttribute('aria-busy') !== 'true');
      assert.equal((await fixture()).calls.check, before.calls.check, `${status} must not trigger another check`);
      assert.equal((await fixture()).calls.install, before.calls.install, 'navigation never installs');
      assert.equal(await panel().getByRole('button', { name: '检查更新', exact: true }).isEnabled(), false);
      assert.equal(await panel().getByRole('button', { name: /重启并更新|重试安装/ }).count(), 0);
    }
  });
  await run('a late startup state-read failure cannot hide a native downloaded event', async () => {
    const before = await fixture();
    await instance.evaluate(({ ipcMain }) => {
      const state = globalThis.__updateUiFixture;
      state.holdState = true;
      state.native = { ...state.native, status: 'downloaded', errorCode: undefined, progress: 100, message: '合成夹具：模拟已验证下载' };
      ipcMain.removeHandler('queue:load');
      ipcMain.handle('queue:load', () => ({ ok: true, data: null }));
    });
    await page.reload();
    await page.locator('.pad-app').waitFor();
    await eventually(fixture, state => state.calls.state > before.calls.state, 'startup state read is pending');
    await instance.evaluate(({ BrowserWindow }) => {
      const state = globalThis.__updateUiFixture;
      BrowserWindow.getAllWindows()[0].webContents.send('updates:state', { ...state.native });
    });
    await navigation().getByRole('button', { name: '我的', exact: true }).click();
    await page.getByRole('button', { name: '关于', exact: true }).click();
    await page.getByRole('button', { name: '重启并更新', exact: true }).waitFor();
    await instance.evaluate(() => globalThis.__updateUiFixture.finishState());
    await panel().getByRole('alert').filter({ hasText: '更新模块未就绪' }).waitFor();
    assert.equal(await panel().getAttribute('data-update-status'), 'downloaded', 'state-read errors are not native state transitions');
    assert.equal(await page.getByRole('button', { name: '重启并更新', exact: true }).isEnabled(), true);
    assert.equal((await fixture()).calls.check, before.calls.check);
    assert.equal((await fixture()).calls.install, before.calls.install);
  });
  assert.deepEqual(await page.evaluate(() => ({ node: typeof process, genericIpc: typeof window.desktop.invoke, updateApi: typeof window.desktop.updates.install })),
    { node: 'undefined', genericIpc: 'undefined', updateApi: 'function' });
  assert.deepEqual(report.rendererErrors, []);
  assert.equal(report.networkAttempts, 0, 'no external renderer requests');
} catch (error) {
  report.failure = error.stack || String(error);
  process.exitCode = 1;
} finally {
  await instance?.close().catch(() => undefined);
  if (child && child.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F']);
    else child.kill('SIGKILL');
    await eventually(async () => child.exitCode, code => code !== null, 'test Electron must exit');
  }
  if (profile) {
    await rm(profile, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 });
    await stat(profile).then(() => assert.fail('isolated test profile still exists'), error => assert.equal(error.code, 'ENOENT'));
  }
  report.profileRemoved = !profile || await stat(profile).then(() => false, error => error.code === 'ENOENT');
  report.electronExited = !child || child.exitCode !== null;
  assert.equal(report.profileRemoved, true);
  assert.equal(report.electronExited, true);
  report.passedCount = report.passed.length;
  await mkdir('release/qa', { recursive: true });
  await writeFile(`release/qa/pad-update-ui${packaged ? '-packaged' : ''}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
