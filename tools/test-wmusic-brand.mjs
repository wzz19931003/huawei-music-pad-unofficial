// Offline, brand-only acceptance of the real packaged executable. Never runs the installer.
import assert from 'node:assert/strict';
import { _electron as launcher } from 'playwright-core';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { APP_BRAND_LABEL, APP_DISPLAY_NAME } from '../src/shared/app-name.mjs';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const scratch = process.env.HERMES_QA_SCRATCH || (process.platform === 'win32'
  ? join(homedir(), 'AppData/Local/hermes/cache/scratch') : tmpdir());
const executablePath = resolve(process.env.WMUSIC_QA_EXECUTABLE || `release/wmusic-brand-${pkg.version}/win-unpacked/${pkg.build.productName}.exe`);
const output = resolve(`release/qa/wmusic-brand-${pkg.version}`);
await mkdir(scratch, { recursive: true });
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(scratch, 'wmusic-brand-qa-'));
const evidence = { scope: 'real packaged application, isolated empty profile, offline branding only', executablePath,
  passed: [], geometry: [], screenshots: [], huaweiService: 'not exercised', installer: 'not run',
  nativeDrag: 'CSS drag region checked; physical titlebar dragging not exercised',
  trayVisual: 'not exercised; embedded tray bytes are verified separately' };
let instance;
let child;
let failed;
const waitNative = async predicate => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(done => setTimeout(done, 50));
  }
  throw new Error('Native window state did not settle');
};
try {
  const env = { ...process.env, TMPDIR: scratch, TMP: scratch, TEMP: scratch };
  delete env.ELECTRON_RUN_AS_NODE;
  instance = await launcher.launch({ executablePath, args: [`--user-data-dir=${profile}`], env, timeout: 30000 });
  child = instance.process();
  const page = await instance.firstWindow({ timeout: 20000 });
  const errors = [];
  const network = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/i.test(request.url())) network.push(new URL(request.url()).origin); });
  await page.locator('.pad-app').waitFor({ state: 'visible', timeout: 15000 });
  evidence.application = await instance.evaluate(({ app }) => ({ name: app.getName(), version: app.getVersion(),
    packaged: app.isPackaged, userData: app.getPath('userData') }));
  assert.equal(resolve(evidence.application.userData), resolve(profile));
  assert.equal(evidence.application.packaged, true);
  assert.equal(evidence.application.version, pkg.version);
  assert.equal(evidence.application.name, pkg.name, 'visible branding must not move the old data identity');
  assert.equal(await page.title(), APP_DISPLAY_NAME);
  assert.equal(await page.locator('.window-brand').innerText(), APP_BRAND_LABEL);
  assert.doesNotMatch(await page.locator('.pad-windowbar').innerText(), /Pad 布局|华为音乐/);
  evidence.passed.push('packaged version, stable technical identity and Wmusic document/header titles');

  for (const size of [{ width: 960, height: 640 }, { width: 1320, height: 840 }, { width: 1920, height: 1080 }]) {
    await instance.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size.width, size.height), size);
    await page.waitForTimeout(200);
    const observation = await page.evaluate(() => {
      const brand = document.querySelector('.window-brand');
      const logo = document.querySelector('.window-brand-logo');
      const controls = document.querySelector('.window-controls');
      const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
      return { width: innerWidth, height: innerHeight, brand: rect(brand), controls: rect(controls),
        logo: { loaded: logo.complete && logo.naturalWidth === 256, region: rect(logo) },
        drag: getComputedStyle(document.querySelector('.pad-windowbar')).getPropertyValue('-webkit-app-region'),
        controlsDrag: getComputedStyle(controls).getPropertyValue('-webkit-app-region'),
        buttonsHit: [...controls.querySelectorAll('button')].every(button => {
          const r = button.getBoundingClientRect();
          return document.elementFromPoint(r.x + r.width/2, r.y + r.height/2)?.closest('button') === button;
        }) };
    });
    assert.ok(Math.abs(observation.brand.x + observation.brand.width / 2 - observation.width / 2) <= 1);
    assert.ok(observation.brand.y >= 0 && observation.brand.bottom <= observation.height);
    assert.ok(observation.brand.right < observation.controls.x, 'centered brand must not overlap native controls');
    assert.equal(observation.logo.loaded, true);
    assert.equal(observation.drag, 'drag');
    assert.equal(observation.controlsDrag, 'no-drag');
    assert.equal(observation.buttonsHit, true);
    evidence.geometry.push(observation);
    const screenshot = join(output, `header-${size.width}x${size.height}.png`);
    await page.screenshot({ path: screenshot });
    evidence.screenshots.push(screenshot);
  }
  evidence.passed.push('centered full-window title and loaded approved image at minimum, normal and large sizes');
  evidence.passed.push('window controls remain unobscured no-drag targets beside the drag title region');

  const boundary = await page.evaluate(() => ({ node: typeof process, genericIpc: typeof window.desktop.invoke,
    resolvePlayback: typeof window.desktop.music.resolvePlayback }));
  assert.deepEqual(boundary, { node: 'undefined', genericIpc: 'undefined', resolvePlayback: 'function' });
  evidence.passed.push('renderer still has no Node or arbitrary IPC');

  // About entry can check updates on open; keep this run offline without changing product code.
  await instance.evaluate(({ ipcMain, app }) => {
    ipcMain.removeHandler('updates:check');
    ipcMain.handle('updates:check', () => ({ ok: true, data: { status: 'idle', currentVersion: app.getVersion(),
      message: '品牌离线验收：未连接更新服务' } }));
  });
  evidence.updateFixture = 'only updates:check replaced for the About view; not live update validation';
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('button', { name: '关于', exact: true }).click();
  await page.locator('.pad-about-screen').waitFor();
  assert.equal(await page.locator('.pad-about-brand h2').innerText(), APP_DISPLAY_NAME);
  assert.match(await page.locator('.pad-update-panel').innerText(), /Wmusic/);
  assert.ok((await page.locator('.pad-about-screen').innerText()).includes(pkg.version));
  evidence.passed.push('About and update panel display Wmusic with the actual running version');
  const aboutScreenshot = join(output, 'about.png');
  await page.screenshot({ path: aboutScreenshot }); evidence.screenshots.push(aboutScreenshot);

  await page.getByRole('button', { name: '最大化', exact: true }).click();
  await waitNative(() => instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized()));
  await page.getByRole('button', { name: '还原', exact: true }).click();
  await waitNative(async () => !await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized()));
  await page.getByRole('button', { name: '最小化', exact: true }).click();
  await waitNative(() => instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()));
  await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore());
  await waitNative(async () => !await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()));
  evidence.passed.push('visible maximize, restore and minimize controls reach the actual native window');
  assert.deepEqual(errors, []);
  assert.deepEqual(network, [], 'the branding probe must not fetch real account/music/update data');
  evidence.rendererErrors = errors; evidence.networkRequests = network;
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await waitNative(async () => child.exitCode !== null || child.signalCode !== null);
  evidence.passed.push('fresh-profile close button exits the real packaged application');
} catch (error) {
  failed = error;
  evidence.error = error.message;
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    try { await instance.close(); } catch { /* fall back to this test process only */ }
    if (child.exitCode === null && child.signalCode === null) {
      try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* process may have exited */ }
    }
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  evidence.electronExited = !child || child.exitCode !== null || child.signalCode !== null;
  try { await stat(profile); evidence.profileRemoved = false; }
  catch (error) { if (error.code !== 'ENOENT') throw error; evidence.profileRemoved = true; }
  evidence.success = !failed && evidence.electronExited && evidence.profileRemoved;
  await writeFile(join(output, 'verification.json'), JSON.stringify(evidence, null, 2) + '\n');
}
if (failed) throw failed;
assert.equal(evidence.success, true);
console.log(JSON.stringify({ success: true, checks: evidence.passed.length, application: evidence.application,
  screenshots: evidence.screenshots, electronExited: evidence.electronExited, profileRemoved: evidence.profileRemoved }, null, 2));
