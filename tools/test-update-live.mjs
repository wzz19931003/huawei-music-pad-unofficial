// Opt-in LIVE public GitHub update discovery/download only. Never installs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { _electron as launcher } from 'playwright-core';

const exe = resolve(process.env.PAD_UPDATE_START_EXE || 'release/bootstrap-0.1.1-fixed/win-unpacked/华为音乐（非官方）.exe');
const expectUnavailable = process.env.PAD_UPDATE_EXPECT_UNAVAILABLE === '1';
const target = process.env.PAD_UPDATE_TARGET_INSTALLER ? resolve(process.env.PAD_UPDATE_TARGET_INSTALLER) : null;
const expectedVersion = process.env.PAD_UPDATE_TARGET_VERSION;
assert.ok(expectUnavailable || target && expectedVersion, 'Supply a genuine target installer/version; no version override of the starting binary is supported.');
const scratch = process.env.HERMES_QA_SCRATCH || process.env.TMPDIR;
assert.ok(scratch, 'Set the designated scratch directory.');
await mkdir(scratch, { recursive: true });
const root = await mkdtemp(join(scratch, 'hw-pad-live-update-'));
const profile = join(root, 'profile');
const localCache = join(root, 'local-cache');
await mkdir(localCache, { recursive: true });
const output = resolve(expectUnavailable ? 'release/qa/update-unavailable' : 'release/qa/update-live');
await mkdir(output, { recursive: true });
const report = { scope: 'Actual packaged native updater; public GitHub, no Huawei login or playback, no installer execution', observedAt: new Date().toISOString(), passed: [], installationRestart: 'not exercised; requires user-confirmed installation', publicRuntimeAuthentication: 'GitHub credential environment variables removed' };
const hash = async (file, algorithm = 'sha256', encoding = 'hex') => {
  const digest = createHash(algorithm);
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest(encoding);
};
let instance, child, failure;
try {
  const env = { ...process.env, LOCALAPPDATA: localCache, TMPDIR: root, TMP: root, TEMP: root };
  for (const key of ['ELECTRON_RUN_AS_NODE', 'GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN', 'GITHUB_PRIVATE_TOKEN']) delete env[key];
  instance = await launcher.launch({ executablePath: exe, args: [`--user-data-dir=${profile}`], env, timeout: 30000 });
  child = instance.process();
  const page = await instance.firstWindow({ timeout: 20000 });
  await page.locator('.pad-app').waitFor({ timeout: 20000 });
  const identity = await instance.evaluate(({ app }) => ({ version: app.getVersion(), packaged: app.isPackaged, userData: app.getPath('userData'), localCache: process.env.LOCALAPPDATA }));
  assert.equal(identity.packaged, true);
  assert.equal(resolve(identity.userData), resolve(profile));
  assert.equal(resolve(identity.localCache), resolve(localCache));
  report.starting = { version: identity.version, exeSha256: await hash(exe), asarSha256: await hash(join(exe, '..', 'resources/app.asar')) };
  const initial = await page.evaluate(() => window.desktop.updates.state());
  assert.equal(initial.ok, true);
  assert.equal(initial.data.currentVersion, identity.version);
  assert.equal(initial.data.status, 'idle');
  const premature = await page.evaluate(() => window.desktop.updates.install());
  assert.equal(premature.ok, false, 'A fresh profile may not install anything');
  report.passed.push('genuine packaged version and isolated profile/cache verified; install-before-download rejected');
  const navigation = page.getByRole('navigation', { name: '主导航' });
  await navigation.getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
  const discovered = await page.evaluate(async () => {
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const result = await window.desktop.updates.state();
      if (result.ok && (['available', 'error'].includes(result.data.status) || result.data.status === 'idle' && result.data.message === '当前已是最新版本')) return result;
      await new Promise(done => setTimeout(done, 200));
    }
    throw new Error('Native update check did not settle within 120 seconds');
  });
  assert.equal(discovered.ok, true);
  report.discovery = discovered.data;
  if (expectUnavailable) {
    assert.equal(discovered.data.status, 'error');
    assert.doesNotMatch(discovered.data.message, /最新版本/);
    assert.equal(await page.getByRole('button', { name: '重启并更新', exact: true }).count(), 0);
    report.passed.push('the real unavailable release feed yields an error, not a false latest/downloaded result');
  } else {
    assert.notEqual(identity.version, expectedVersion, 'Do not fake an old version with newest bytes');
    assert.equal(discovered.data.status, 'available');
    assert.equal(discovered.data.version, expectedVersion);
    report.passed.push('the native public GitHub transport discovered the genuine newer released version');
    await page.screenshot({ path: join(output, '01-available.png') });
    await page.getByRole('button', { name: '下载更新', exact: true }).click();
    await page.waitForFunction(() => ['downloading', 'downloaded', 'error'].includes(document.querySelector('.pad-update-panel')?.dataset.updateStatus));
    // Navigation is a user operation while the native download promise is pending.
    await navigation.getByRole('button', { name: '我的', exact: true }).click();
    await page.getByRole('button', { name: '关于', exact: true }).click();
    await page.locator('.pad-about-screen .pad-update-panel').waitFor();
    report.passed.push('renderer navigation and About remain responsive during the update action');
    await page.waitForFunction(() => ['downloaded', 'error'].includes(document.querySelector('.pad-update-panel')?.dataset.updateStatus), undefined, { timeout: 600000 });
    const complete = await page.evaluate(() => window.desktop.updates.state());
    assert.equal(complete.ok, true);
    assert.equal(complete.data.status, 'downloaded', JSON.stringify(complete.data));
    assert.equal(complete.data.version, expectedVersion);
    assert.equal(await instance.evaluate(({ app }) => app.getVersion()), identity.version, 'No unconfirmed restart is permitted');
    assert.equal(await page.getByRole('button', { name: '重启并更新', exact: true }).count(), 1);
    const targetHash = await hash(target);
    const files = (await readdir(localCache, { recursive: true })).filter(name => name.toLowerCase().endsWith('.exe'));
    const matches = [];
    for (const name of files) {
      const file = join(localCache, name);
      if (await hash(file) === targetHash) matches.push({ path: relative(root, file), bytes: (await stat(file)).size, sha256: targetHash, sha512: await hash(file, 'sha512', 'base64') });
    }
    assert.equal(matches.length, 1, 'exactly one cached verified payload must match the frozen released installer');
    report.download = { state: complete.data, targetVersion: expectedVersion, cacheCandidates: files.length, payload: matches[0] };
    report.passed.push('native update-downloaded authorization reached; cached installer bytes exactly match the genuine target; current app remains on old version pending confirmation');
    await page.screenshot({ path: join(output, '02-downloaded-awaiting-confirmation.png') });
  }
} catch (error) {
  failure = error;
  report.failure = error instanceof Error ? error.message : 'Live update verification failed';
} finally {
  // Force-terminate this owned process tree: never let a failed test trigger an installer on exit.
  if (child && child.exitCode === null) await promisify(execFile)('taskkill.exe', ['/PID', String(child.pid), '/T', '/F']).catch(() => undefined);
  if (child && child.exitCode === null) await new Promise(resolveExit => { child.once('exit', resolveExit); setTimeout(resolveExit, 5000); });
  await instance?.close().catch(() => undefined);
  report.electronExited = !child || child.exitCode !== null || child.signalCode !== null;
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  report.profileAndCacheRemoved = await access(root).then(() => false, () => true);
  await writeFile(join(output, 'verification.json'), JSON.stringify(report, null, 2));
}
assert.equal(report.electronExited, true);
assert.equal(report.profileAndCacheRemoved, true);
console.log(JSON.stringify(report, null, 2));
if (failure) throw failure;
