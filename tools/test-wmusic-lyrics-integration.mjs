// Actual compiled main/preloads/renderer via TEST-ONLY containment/instrumentation.
// Offline synthetic DTO transport/native lifecycle, NOT Audio/provider/packaged/installer/live-account acceptance.
// Requires parent-owned frozen out/. This maintained tool never builds or writes it.
import assert from 'node:assert/strict';
import electron from 'electron';
import { _electron } from 'playwright-core';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = resolve(process.env.HERMES_QA_SCRATCH || (process.platform === 'win32' ? join(homedir(), 'AppData/Local/hermes/cache/scratch') : process.env.TMPDIR || ''));
assert.ok(scratch && (process.platform === 'win32' || process.env.HERMES_QA_SCRATCH || process.env.TMPDIR), 'designated scratch required');
await mkdir(scratch, { recursive: true });
const root = await mkdtemp(join(scratch, 'wmusic-lyrics-integration-'));
const profile = join(root, 'profile');
const runtime = join(root, 'runtime');
const evidence = join(root, 'evidence');
const primaryUrl = pathToFileURL(join(repo, 'out/renderer/index.html')).href;
const overlayUrl = pathToFileURL(join(repo, 'out/renderer/desktop-lyrics.html')).href;
const store = join(profile, 'desktop-lyrics.json');
const preferenceKeys = ['color', 'fontSize', 'highlightColor', 'locked', 'position', 'showTranslation', 'version', 'visible', 'wordHighlight'];
const labels = [
  'actual compiled main registers dedicated IPC; primary exposes the narrow lyric publisher',
  'primary IPC opens real isolated overlay without Node, general bridge or another Audio',
  'synthetic current/next, source translation and word toggles render through actual IPC and controls',
  'bounded 2048-character current/next renders; oversize text and unexpected capabilities are rejected',
  'source clock pause, backward seek, bounded extrapolation and next-line promotion work without Audio',
  'primary lock sets Win32 click-through; actual captured tray MenuItem callback unlocks (NOT physical taskbar clicking)',
  'real overlay font slider/color IPC and moved native position persist in the dedicated sanitized store',
  'primary reload accepts automatic generation-zero clear, rejects its revival, accepts a newer synthetic source and rejects delayed old epoch',
  'actual primary preload in a wrong native window is denied at the identical document URL',
  'actual quit and second process with SAME isolated profile restore preferences but no track or clock',
  'default primary close exits with overlay visible and destroys both native windows',
];
const report = { scope: 'actual compiled main via test-only containment/instrumentation bootstrap; offline synthetic DTO transport and real IPC/overlay/Win32/native lifecycle; NOT real Audio/player-publisher/provider/packaged/installer/live-account acceptance',
  passed: [], steps: [], errors: [], rendererErrors: [], screenshots: [], processes: [], fingerprintChecks: [], plannedCases: labels,
  root, profile, store, scratch, primaryUrl, overlayUrl, processExited: false, profileRemoved: false, runtimeRemoved: false,
  trayRecoveryMethod: 'captured real MenuItem.click callback invocation; NOT physical taskbar clicking',
  movementMethod: 'real BrowserWindow.setPosition plus production move listener; NOT physical pointer drag' };
const env = { ...process.env, TMPDIR: scratch, TMP: scratch, TEMP: scratch };
for (const key of Object.keys(env)) if (/^(?:HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|ELECTRON_RUN_AS_NODE|HWMUSIC_USE_SYSTEM_PROXY)$/i.test(key)) delete env[key];
const launches = [];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fail = error => { report.errors.push(String(error?.stack || error)); process.exitCode = 1; console.error(error); };
let instance;
let child;
let primaryId, overlayPage, publication, expectedPreferences;
async function fingerprint(directory, prefix = '') {
  const result = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(result, await fingerprint(join(directory, entry.name), name + '/'));
    else result[name] = createHash('sha256').update(await readFile(join(directory, entry.name))).digest('hex');
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
async function eventually(read, predicate, label, timeout = 10000) {
  const end = Date.now() + timeout;
  let value;
  // Explicit await: never Promise-truthy waitForFunction, and below real state IPC rate limits.
  do { value = await read(); if (predicate(value)) return value; await sleep(150); } while (Date.now() < end);
  assert.fail(`${label}: ${JSON.stringify(value)}`);
}
async function primary(expression) {
  return instance.evaluate(({ BrowserWindow }, { id, url, expression }) => {
    const window = BrowserWindow.fromId(id);
    if (!window || window.webContents.getURL() !== url) throw new Error('Exact primary document unavailable');
    return window.webContents.executeJavaScript(expression);
  }, { id: primaryId, url: primaryUrl, expression });
}
async function overlay(expression) {
  return instance.evaluate(({ BrowserWindow }, { url, expression }) => {
    const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === url);
    if (!window) throw new Error('Exact overlay document unavailable');
    return window.webContents.executeJavaScript(expression);
  }, { url: overlayUrl, expression });
}
function ok(result) { assert.equal(result?.ok, true, JSON.stringify(result)); return result.data; }
async function state() {
  // Native state capabilities allow 10/s, burst 6. Keep this sequential observer below that rate.
  await sleep(150);
  // Observation must not compete with the real automatic primary publisher's query bucket.
  return ok(await (overlayPage && !overlayPage.isClosed()
    ? overlay('window.desktopLyrics.state()')
    : primary('window.desktop.desktopLyrics.state()')));
}
async function publish(patch = {}) {
  publication = { ...publication, ...patch };
  ok(await primary(`window.desktop.desktopLyrics.publish(${JSON.stringify(publication)})`));
}
async function assertFrozen(label) {
  const actual = await fingerprint(join(repo, 'out'));
  report.fingerprintChecks.push({ label, sha256: sha256(JSON.stringify(actual)), at: new Date().toISOString() });
  assert.deepEqual(actual, report.outputSha256, 'compiled output fingerprint drift: freeze out/; never retry against mixed bytes');
}
async function run(index, body) {
  const step = { label: labels[index], status: 'running', startedAt: new Date().toISOString() };
  report.steps.push(step);
  try {
    await assertFrozen(`before case ${index + 1}`); step.observed = await body(); await assertFrozen(`after case ${index + 1}`);
    step.status = 'passed'; report.passed.push(step.label); console.log('PASS ' + step.label);
  } catch (error) { step.status = 'failed'; step.error = String(error?.stack || error); throw error; }
  finally { step.finishedAt = new Date().toISOString(); }
}
async function overlayReady() {
  overlayPage = await eventually(async () => (await instance.windows()).find(page => page.url() === overlayUrl), Boolean, 'real overlay page');
  await overlayPage.locator('.dl-lines').waitFor({ timeout: 10000 });
}
async function trayState() {
  return instance.evaluate(() => {
    const menus = globalThis.__wmusicQaMenus.filter(menu => menu.getMenuItemById('desktop-lyrics-unlock'));
    const menu = menus.at(-1), unlock = menu?.getMenuItemById('desktop-lyrics-unlock'), toggle = menu?.getMenuItemById('desktop-lyrics-toggle');
    return { menuCount: menus.length, unlockEnabled: unlock?.enabled, toggleEnabled: toggle?.enabled, toggleChecked: toggle?.checked };
  });
}
async function screenshot(name, url) {
  const image = await eventually(async () => {
    try {
      return await instance.evaluate(async ({ BrowserWindow }, url) => {
        const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === url);
        if (!window || !window.isVisible()) throw new Error('Capture requires an owned visible native window');
        // URL/preload readiness can precede the first compositor frame on Windows.
        if (!await window.webContents.executeJavaScript('document.readyState === "complete" && !!document.body?.children.length')) return null;
        return { id: window.id, bounds: window.getBounds(), png: (await window.webContents.capturePage()).toPNG().toString('base64') };
      }, url);
    } catch (error) {
      if (!String(error).includes('UnknownVizError')) throw error;
      report.captureRetries ??= []; report.captureRetries.push({ name, reason: 'first compositor frame unavailable: UnknownVizError' });
      return null;
    }
  }, Boolean, 'owned window compositor capture', 5000);
  const bytes = Buffer.from(image.png, 'base64'), path = join(evidence, name + '.png');
  assert.ok(bytes.length > 100, 'missing native captured pixels'); await writeFile(path, bytes);
  report.screenshots.push({ path, windowId: image.id, bounds: image.bounds, bytes: bytes.length, sha256: sha256(bytes), method: 'owned webContents.capturePage' });
}
function pythonProbe(program, argument) {
  const result = spawnSync('python3', ['-c', program, JSON.stringify(argument)], { encoding: 'utf8', env, timeout: 10000, windowsHide: true });
  assert.equal(result.status, 0, result.error?.message || result.stderr || 'native Python probe failed'); return JSON.parse(result.stdout.trim());
}
async function nativeWindows() {
  return instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => {
    const bytes = window.getNativeWindowHandle();
    return { id: window.id, url: window.webContents.getURL(), hwnd: bytes.length >= 8 ? bytes.readBigUInt64LE().toString() : bytes.readUInt32LE().toString(),
      visible: window.isVisible(), movable: window.isMovable(), focusable: window.isFocusable(), bounds: window.getBounds() };
  }));
}
async function nativeInputStyle() {
  const window = (await nativeWindows()).find(window => window.url === overlayUrl); assert.ok(window, 'missing overlay HWND');
  const style = pythonProbe("import ctypes,json,sys; u=ctypes.WinDLL('user32',use_last_error=True); g=u.GetWindowLongPtrW; g.argtypes=[ctypes.c_void_p,ctypes.c_int]; g.restype=ctypes.c_ssize_t; w=u.IsWindow; w.argtypes=[ctypes.c_void_p]; w.restype=ctypes.c_int; h=ctypes.c_void_p(int(json.loads(sys.argv[1]))); assert w(h), 'invalid HWND'; ctypes.set_last_error(0); s=g(h,-20); assert s or ctypes.get_last_error()==0; print(json.dumps({'extendedStyle':hex(s),'clickThrough':bool(s & 0x20),'layered':bool(s & 0x80000),'topmost':bool(s & 0x8)}))", window.hwnd);
  return { ...window, ...style, method: 'Win32 GetWindowLongPtrW(HWND, GWL_EXSTYLE=-20)' };
}
function nativeLiveness(pids, windows) {
  return pythonProbe(`import ctypes,json,sys
q=json.loads(sys.argv[1]); u=ctypes.WinDLL('user32',use_last_error=True); k=ctypes.WinDLL('kernel32',use_last_error=True)
u.IsWindow.argtypes=[ctypes.c_void_p]; u.IsWindow.restype=ctypes.c_int
k.OpenProcess.argtypes=[ctypes.c_uint32,ctypes.c_int,ctypes.c_uint32]; k.OpenProcess.restype=ctypes.c_void_p
k.WaitForSingleObject.argtypes=[ctypes.c_void_p,ctypes.c_uint32]; k.WaitForSingleObject.restype=ctypes.c_uint32
k.CloseHandle.argtypes=[ctypes.c_void_p]; k.CloseHandle.restype=ctypes.c_int
alive=[]
for pid in q['pids']:
 h=k.OpenProcess(0x100000,False,pid)
 if h:
  if k.WaitForSingleObject(h,0)==258: alive.append(pid)
  k.CloseHandle(h)
 else:
  assert ctypes.get_last_error() in (0,87), 'cannot verify process liveness'
print(json.dumps({'alivePids':alive,'liveWindows':[v for v in q['windows'] if u.IsWindow(ctypes.c_void_p(int(v['hwnd'])))]}))`, { pids: [...new Set(pids)], windows });
}
async function rememberNative() {
  const record = launches.at(-1), windows = await nativeWindows();
  const pids = await instance.evaluate(({ app }) => app.getAppMetrics().map(metric => metric.pid));
  record.windows = [...new Map([...record.windows, ...windows].map(window => [window.hwnd, window])).values()];
  record.pids = [...new Set([...record.pids, ...pids])]; return windows;
}
async function persisted(name) {
  let bytes;
  if (name) {
    // A restored native window can emit a legitimate debounced move/save after its first
    // state reply. An instantaneous .tmp check races atomic I/O; require a bounded quiet
    // interval with identical JSON bytes AND no remaining atomic-write files instead.
    let lastHash, quietSince = Date.now();
    const started = Date.now();
    bytes = await eventually(async () => {
      const candidate = await readFile(store), hash = sha256(candidate);
      const temporary = (await readdir(profile)).filter(name => /^desktop-lyrics-.*\.tmp$/.test(name));
      if (temporary.length || hash !== lastHash) { lastHash = hash; quietSince = Date.now(); return null; }
      return Date.now() - quietSince >= 450 ? candidate : null;
    }, value => value !== null, 'dedicated JSON settled with no atomic temporary residue', 7000);
    report.storeSettling ??= [];
    report.storeSettling.push({ name, waitedMs: Date.now() - started, quietMinimumMs: 450, sha256: sha256(bytes), remainingTemporaryFiles: [] });
  } else bytes = await readFile(store);
  assert.ok(bytes.length <= 16384, 'dedicated store exceeds 16 KiB');
  const preferences = JSON.parse(bytes.toString('utf8')); assert.deepEqual(Object.keys(preferences).sort(), preferenceKeys); assert.equal(preferences.version, 1);
  assert.ok(preferences.position && Number.isInteger(preferences.position.x) && Number.isInteger(preferences.position.y));
  if (name) await writeFile(join(evidence, name + '.json'), bytes);
  return { preferences, sha256: sha256(bytes), bytes: bytes.length };
}
async function launch() {
  await assertFrozen('before process launch');
  const number = launches.length + 1, lifecycle = join(evidence, `launch-${number}-lifecycle.jsonl`), startup = join(evidence, `launch-${number}-startup.json`);
  const bootstrap = join(runtime, `bootstrap-${number}.cjs`);
  const code = `const { app, Menu, session } = require('electron'); const fs = require('node:fs'); const path = require('node:path');
const profile = ${JSON.stringify(profile)}; const lifecycle = ${JSON.stringify(lifecycle)};
const log = value => fs.appendFileSync(lifecycle, JSON.stringify({ ...value, at: new Date().toISOString() }) + '\\n');
app.setPath('userData', profile); app.setPath('sessionData', profile);
if (path.resolve(app.getPath('userData')) !== path.resolve(profile) || path.resolve(app.getPath('sessionData')) !== path.resolve(profile)) throw new Error('QA containment failed BEFORE import/store access');
fs.writeFileSync(${JSON.stringify(startup)}, JSON.stringify({ pid: process.pid, userData: app.getPath('userData'), sessionData: app.getPath('sessionData'), beforeProductionImport: true, versions: process.versions }));
globalThis.__wmusicQaMenus = []; const buildMenu = Menu.buildFromTemplate.bind(Menu);
Menu.buildFromTemplate = (...args) => { const menu = buildMenu(...args); globalThis.__wmusicQaMenus.push(menu); return menu; };
let httpBlocked = 0;
app.on('browser-window-created', (_event, window) => { let url = ''; const bytes = window.getNativeWindowHandle(); const hwnd = bytes.length >= 8 ? bytes.readBigUInt64LE().toString() : bytes.readUInt32LE().toString();
 log({ event: 'window-created', id: window.id, hwnd });
 window.webContents.on('did-finish-load', () => { url = window.webContents.getURL(); log({ event: 'document-loaded', id: window.id, url }); });
 window.webContents.on('preload-error', (_event, _path, error) => log({ event: 'preload-error', id: window.id, message: String(error.message) }));
 window.on('closed', () => log({ event: 'window-closed', id: window.id, hwnd, url }));
});
app.on('before-quit', () => log({ event: 'before-quit' }));
app.on('will-quit', () => log({ event: 'will-quit', remainingWindows: require('electron').BrowserWindow.getAllWindows().length, httpBlocked }));
app.on('quit', (_event, exitCode) => log({ event: 'quit', exitCode, httpBlocked }));
(async () => { await app.whenReady(); const requests = session.defaultSession.webRequest; const before = requests.onBeforeRequest.bind(requests);
requests.onBeforeRequest = (...args) => { const callback = args.at(-1); return before({ urls: ['<all_urls>'] }, (details, done) => {
 if (/^https?:/i.test(details.url)) { httpBlocked++; return done({ cancel: true }); }
 if (typeof callback === 'function') return callback(details, done); done({ cancel: false });
}); };
requests.onBeforeRequest({ urls: ['<all_urls>'] }, (_details, done) => done({ cancel: false }));
await import(${JSON.stringify(pathToFileURL(join(repo, 'out/main/index.js')).href)});
})().catch(error => { log({ event: 'bootstrap-error', message: String(error.stack || error) }); console.error(error); app.exit(1); });`;
  await writeFile(bootstrap, code);
  const record = { number, bootstrapSha256: sha256(code), lifecycle, startup, windows: [], pids: [], exitedNaturally: false }; launches.push(record);
  instance = await _electron.launch({ executablePath: electron, args: [bootstrap], cwd: repo, env, timeout: 30000 });
  child = instance.process(); record.instance = instance; record.child = child; record.pids.push(child.pid);
  const attached = new WeakSet();
  const attach = page => { if (!attached.has(page)) { attached.add(page); page.on('pageerror', error => report.rendererErrors.push({ launch: number, url: page.url(), message: error.message })); } };
  instance.on('window', attach); for (const page of await instance.windows()) attach(page);
  const containment = JSON.parse(await readFile(startup, 'utf8'));
  // Playwright launches through cmd.exe on Windows: its cached ChildProcess PID is the
  // launcher, not necessarily Electron's main PID. Bind to the actual inspector process.
  record.pids.push(containment.pid);
  assert.equal(containment.pid, await instance.evaluate(() => process.pid)); assert.equal(containment.beforeProductionImport, true);
  assert.equal(resolve(containment.userData), profile); assert.equal(resolve(containment.sessionData), profile);
  assert.equal(resolve(await instance.evaluate(({ app }) => app.getPath('userData'))), profile); record.startupEvidence = containment;
  primaryId = await eventually(() => instance.evaluate(({ BrowserWindow }, url) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === url)?.id, primaryUrl), Number.isInteger, 'real primary document');
  await eventually(() => primary('typeof window.desktop?.desktopLyrics?.state === "function"'), Boolean, 'primary preload capability');
  // Before initial overlay creation in process 1. Do NOT claim complete-startup Audio instrumentation
  // for process 2: its restored overlay may predate this init script.
  await instance.context().addInitScript(() => {
    window.__wmusicQaMedia = { audioConstructions: 0, playCalls: 0 };
    window.Audio = new Proxy(window.Audio, { construct(target, args, newTarget) { window.__wmusicQaMedia.audioConstructions++; return Reflect.construct(target, args, newTarget); } });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) { window.__wmusicQaMedia.playCalls++; return play.apply(this, args); };
  });
  await rememberNative(); return record;
}
async function exitAndVerify(trigger) {
  const record = launches.at(-1), windows = await rememberNative();
  assert.equal(windows.some(window => window.url === overlayUrl && window.visible), true, 'overlay must be visible when quitting'); record.quitTrigger = trigger;
  if (trigger === 'primary window.desktop.app.quit() IPC') await primary('(() => { window.desktop.app.quit().catch(() => {}); return true; })()');
  else await instance.evaluate(({ BrowserWindow }, id) => { BrowserWindow.fromId(id).close(); }, primaryId);
  // No test-side controller.dispose(), app.quit() or instance.close() in either acceptance path.
  await eventually(() => Promise.resolve(child.exitCode !== null || child.signalCode !== null), Boolean, 'actual application quit', 7500);
  assert.equal(child.exitCode, 0, 'must exit cleanly without force kill'); record.exitedNaturally = true; record.exitCode = child.exitCode; record.signalCode = child.signalCode;
  record.nativeCleanup = await eventually(() => Promise.resolve(nativeLiveness(record.pids, record.windows)), value => !value.alivePids.length && !value.liveWindows.length, 'native subprocess/window cleanup', 7500);
  const events = (await readFile(record.lifecycle, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  for (const window of windows.filter(window => window.url === primaryUrl || window.url === overlayUrl)) assert.equal(events.some(event => event.event === 'window-closed' && event.id === window.id), true, `owned window ${window.id} must close`);
  assert.equal(events.some(event => event.event === 'will-quit' && event.remainingWindows === 0), true); assert.equal(events.some(event => event.event === 'quit' && event.exitCode === 0), true);
  assert.deepEqual(events.filter(event => event.event === 'bootstrap-error' || event.event === 'preload-error'), []);
  return { pid: record.startupEvidence.pid, launcherPid: child.pid, exitCode: child.exitCode, trigger, nativeCleanup: record.nativeCleanup, lifecycle: record.lifecycle };
}
try {
  assert.equal(process.platform, 'win32', 'requires real Windows/Win32; never silently skip native assertions');
  await Promise.all([mkdir(profile), mkdir(runtime), mkdir(evidence)]);
  assert.deepEqual(await readdir(profile), [], 'fresh isolated profile required; never seed/read real configuration');
  for (const file of ['out/main/index.js', 'out/preload/index.cjs', 'out/preload/desktop-lyrics.cjs', 'out/renderer/index.html', 'out/renderer/desktop-lyrics.html']) await stat(join(repo, file));
  report.harnessSha256 = sha256(await readFile(fileURLToPath(import.meta.url)));
  report.outputSha256 = await fingerprint(join(repo, 'out'));
  report.outputInventorySha256Before = sha256(JSON.stringify(report.outputSha256));
  await writeFile(join(evidence, 'out-before.json'), JSON.stringify(report.outputSha256, null, 2) + '\n');
  await launch();
  await run(0, async () => {
    const boundary = await primary('({ node: typeof process, require: typeof require, genericInvoke: typeof window.desktop.invoke, overlay: typeof window.desktopLyrics, api: Object.keys(window.desktop.desktopLyrics).sort() })');
    assert.deepEqual(boundary, { node: 'undefined', require: 'undefined', genericInvoke: 'undefined', overlay: 'undefined', api: ['onState', 'publish', 'state', 'updatePreferences'] });
    const initial = await state();
    assert.equal(initial.preferences.visible, false); assert.equal(initial.snapshot.track, null); assert.equal(initial.snapshot.anchor, null); assert.equal(initial.shown, false);
    await primary('(() => { window.__wmusicQaStates = []; window.desktop.desktopLyrics.onState(value => { window.__wmusicQaStates.push(value); if (window.__wmusicQaStates.length > 32) window.__wmusicQaStates.shift(); }); return true; })()');
    report.electronVersion = launches[0].startupEvidence.versions.electron; await screenshot('primary-offline', primaryUrl);
    return { boundary, initial, containmentBeforeImport: launches[0].startupEvidence.beforeProductionImport, electronVersion: report.electronVersion };
  });
  await run(1, async () => {
    ok(await primary('window.desktop.desktopLyrics.updatePreferences({ visible: true })')); await overlayReady();
    const boundary = await overlay('({ node: typeof process, require: typeof require, desktop: typeof window.desktop, api: Object.keys(window.desktopLyrics).sort(), media: window.__wmusicQaMedia, rows: document.querySelectorAll("[data-lyric-row]").length, mediaElements: document.querySelectorAll("audio,video").length })');
    assert.deepEqual(boundary, { node: 'undefined', require: 'undefined', desktop: 'undefined', api: ['hide', 'onState', 'state', 'updatePreferences'], media: { audioConstructions: 0, playCalls: 0 }, rows: 2, mediaElements: 0 });
    const native = await instance.evaluate(({ BrowserWindow }, url) => {
      const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === url), prefs = window.webContents.getLastWebPreferences();
      return { visible: window.isVisible(), topmost: window.isAlwaysOnTop(), sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration, webSecurity: prefs.webSecurity, webviewTag: prefs.webviewTag };
    }, overlayUrl);
    assert.deepEqual(native, { visible: true, topmost: true, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, webviewTag: false });
    assert.equal(await overlayPage.locator('.dl-current').textContent(), '尚未播放'); await rememberNative(); return { boundary, native };
  });
  await run(2, async () => {
    const initial = await state(), menusBefore = await trayState();
    publication = { epoch: initial.snapshot.epoch, generation: 7, sequence: 1,
      track: { key: 'synthetic-source-7', title: '<script>synthetic only</script>', artist: '离线合成 · 非音源' }, clock: { positionMs: 1500, playing: false, rate: 1 },
      current: { timeMs: 1000, text: '你好', translation: '<img src=x onerror=bad()>', segments: [{ timeMs: 1000, text: '你' }, { timeMs: 1500, text: '好' }] }, next: { timeMs: 3000, text: '来源下一行（合成）' } };
    await publish();
    await eventually(() => overlayPage.locator('.dl-lines').getAttribute('data-active-word'), value => value === '1', 'source word boundary at 1500ms');
    assert.equal(await overlayPage.locator('.dl-current').textContent(), '你好'); assert.equal(await overlayPage.locator('.dl-secondary').textContent(), publication.current.translation);
    assert.equal(await overlayPage.locator('.dl-secondary').getAttribute('data-translation'), 'true'); assert.equal(await overlayPage.locator('img,audio,video,iframe,script:not([src])').count(), 0);
    assert.equal(await overlay('typeof window.bad'), 'undefined'); await screenshot('synthetic-source-translation-words', overlayUrl);
    await overlayPage.getByLabel('译文', { exact: true }).uncheck();
    await eventually(() => overlayPage.locator('.dl-secondary').textContent(), value => value === publication.next.text, 'translation off exposes source next line');
    await overlayPage.getByLabel('逐词', { exact: true }).uncheck();
    await eventually(() => overlayPage.locator('.dl-lines').getAttribute('data-active-word'), value => value === '-1', 'word toggle disables highlight');
    assert.equal(await overlayPage.locator('.dl-word').count(), 0); assert.equal(await overlayPage.locator('.dl-current').textContent(), '你好');
    await overlayPage.getByLabel('逐词', { exact: true }).check();
    await eventually(() => overlayPage.locator('.dl-word-active').textContent(), value => value === '好', 'word toggle restores source segment');
    await overlayPage.getByLabel('译文', { exact: true }).check();
    await eventually(() => overlayPage.locator('.dl-secondary').textContent(), value => value === publication.current.translation, 'translation toggle restores source translation');
    await eventually(state, value => value.preferences.showTranslation, 'translation on committed through IPC');
    await overlayPage.getByLabel('译文', { exact: true }).uncheck();
    await eventually(() => overlayPage.locator('.dl-secondary').textContent(), value => value === publication.next.text, 'translation toggle returns to supplied next line');
    const committed = await eventually(state, value => !value.preferences.showTranslation && value.preferences.wordHighlight, 'UI toggles committed through IPC');
    const received = await primary('window.__wmusicQaStates.some(value => value.snapshot.track?.key === "synthetic-source-7")');
    assert.equal(received, true); assert.equal((await trayState()).menuCount, menusBefore.menuCount, 'lyric broadcasts must not rebuild tray menu');
    return { transport: 'direct synthetic primary desktop.desktopLyrics.publish(), NOT live player publisher', current: '你好', next: publication.next.text, word: '好', preferences: committed.preferences, onStateObserved: received };
  });
  await run(3, async () => {
    const bounded = { epoch: publication.epoch, generation: 8, sequence: 1, track: { key: 'synthetic-max-text', title: '有界文本样本', artist: '离线合成' }, clock: { positionMs: 1500, playing: false, rate: 1 }, current: { timeMs: 1000, text: '界'.repeat(2048) }, next: { timeMs: 3000, text: '后'.repeat(2048) } };
    ok(await primary(`window.desktop.desktopLyrics.publish(${JSON.stringify(bounded)})`));
    await eventually(() => overlayPage.locator('.dl-current').textContent(), value => value === bounded.current.text, '2048-character current rendered'); assert.equal(await overlayPage.locator('.dl-secondary').textContent(), bounded.next.text);
    const geometry = await overlay(`(() => { const row = document.querySelector('.dl-current'), box = row.getBoundingClientRect(), css = getComputedStyle(row); return { length: row.textContent.length, rows: document.querySelectorAll('[data-lyric-row]').length, overflow: css.overflowX, ellipsis: css.textOverflow, left: box.left, right: box.right, width: innerWidth, scrollWidth: row.scrollWidth, clientWidth: row.clientWidth }; })()`);
    assert.equal(geometry.length, 2048); assert.equal(geometry.rows, 2); assert.equal(geometry.overflow, 'hidden'); assert.equal(geometry.ellipsis, 'ellipsis'); assert.ok(geometry.left >= 0 && geometry.right <= geometry.width && geometry.scrollWidth > geometry.clientWidth);
    const invalid = await primary(`window.desktop.desktopLyrics.publish(${JSON.stringify({ ...bounded, sequence: 2, current: { ...bounded.current, text: '界'.repeat(2049) } })})`);
    assert.equal(invalid.ok, false); assert.equal(invalid.error.code, 'INVALID'); assert.equal((await state()).snapshot.current.text, bounded.current.text);
    const extra = await primary(`window.desktop.desktopLyrics.publish(${JSON.stringify({ ...bounded, sequence: 2, mediaUrl: 'not-a-capability' })})`);
    assert.equal(extra.ok, false); assert.equal(extra.error.code, 'INVALID');
    const prefs = await overlay('window.desktopLyrics.updatePreferences({ visible: false })'); assert.equal(prefs.ok, false); assert.equal(prefs.error.code, 'INVALID'); assert.equal((await state()).shown, true);
    await publish({ generation: 9, sequence: 1 }); await eventually(() => overlayPage.locator('.dl-current').textContent(), value => value === '你好', 'return from boundary fixture');
    return { acceptedCurrentCharacters: 2048, acceptedNextCharacters: 2048, rejectedCharacters: 2049, rejectionBoundary: 'real public preload schema', invalidCode: invalid.error.code, extraFieldCode: extra.error.code, overlayVisiblePatchCode: prefs.error.code, geometry };
  });
  await run(4, async () => {
    await publish({ sequence: 2, clock: { positionMs: 1400, playing: false, rate: 2 } });
    await eventually(() => overlayPage.locator('.dl-lines').getAttribute('data-active-word'), value => value === '0', 'backward seek returns to first source segment');
    await sleep(300); assert.equal(await overlayPage.locator('.dl-lines').getAttribute('data-active-word'), '0', 'paused anchor must not advance');
    await publish({ sequence: 3, clock: { positionMs: 1100, playing: true, rate: 2 }, next: { timeMs: 8000, text: '冻结之后的来源行' } });
    await eventually(() => overlayPage.locator('.dl-lines').getAttribute('data-active-word'), value => value === '1', 'playing/rate DTO advances source boundary');
    await eventually(() => overlayPage.locator('.desktop-lyrics').getAttribute('data-stale'), value => value === 'true', 'extrapolation stops after bounded 1.5 seconds'); await sleep(200); assert.equal(await overlayPage.locator('.dl-current').textContent(), '你好');
    await publish({ sequence: 4, clock: { positionMs: 3000, playing: false, rate: 1 }, next: { timeMs: 3000, text: '来源下一行（合成）' } });
    await eventually(() => overlayPage.locator('.dl-current').textContent(), value => value === publication.next.text, 'next source line promoted at supplied boundary');
    await publish({ sequence: 5, clock: { positionMs: 1500, playing: false, rate: 1 } }); await eventually(() => overlayPage.locator('.dl-current').textContent(), value => value === '你好', 'seek back restores current line');
    return { pausedWordIndex: 0, playingWordIndex: 1, staleObserved: true, extrapolationBoundMs: 1500, promotedLine: publication.next.text, media: await overlay('window.__wmusicQaMedia') };
  });
  await run(5, async () => {
    ok(await primary('window.desktop.desktopLyrics.updatePreferences({ locked: true })')); await eventually(state, value => value.preferences.locked && value.persistence === 'saved', 'primary lock committed');
    await eventually(() => overlayPage.locator('.desktop-lyrics').getAttribute('data-locked'), value => value === 'true', 'overlay lock state'); report.lockedNativeStyle = await nativeInputStyle();
    assert.equal(report.lockedNativeStyle.clickThrough, true, 'Win32 WS_EX_TRANSPARENT must be set'); assert.equal(report.lockedNativeStyle.topmost, true); assert.equal(report.lockedNativeStyle.movable, false); assert.equal(report.lockedNativeStyle.focusable, false); assert.equal(await overlayPage.locator('input').count(), 0);
    const lockedMenu = await eventually(trayState, value => value.unlockEnabled === true, 'actual tray unlock enabled'); assert.equal(lockedMenu.toggleChecked, true); assert.equal(lockedMenu.toggleEnabled, true); await screenshot('locked-native-click-through', overlayUrl);
    const invocation = await instance.evaluate(({ BrowserWindow }, id) => {
      const menu = globalThis.__wmusicQaMenus.filter(menu => menu.getMenuItemById('desktop-lyrics-unlock')).at(-1), item = menu?.getMenuItemById('desktop-lyrics-unlock');
      if (!item?.enabled || typeof item.click !== 'function') throw new Error('Actual enabled tray MenuItem callback unavailable');
      const observed = { id: item.id, enabledBeforeInvocation: item.enabled, method: 'captured real MenuItem.click callback invocation; NOT physical taskbar clicking' };
      item.click(item, BrowserWindow.fromId(id), { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }); return observed;
    }, primaryId);
    await eventually(state, value => !value.preferences.locked && value.persistence === 'saved', 'actual tray callback unlocked native state'); report.unlockedNativeStyle = await eventually(nativeInputStyle, value => !value.clickThrough, 'Win32 click-through bit cleared');
    assert.equal(report.unlockedNativeStyle.topmost, true); assert.equal(report.unlockedNativeStyle.movable, true); assert.equal(report.unlockedNativeStyle.focusable, true); await overlayPage.getByLabel('字体大小', { exact: true }).waitFor();
    const unlockedMenu = await eventually(trayState, value => value.unlockEnabled === false, 'real tray menu reflects unlocked state');
    return { invocation, lockedMenu, unlockedMenu, lockedNativeStyle: report.lockedNativeStyle, unlockedNativeStyle: report.unlockedNativeStyle };
  });
  await run(6, async () => {
    const range = overlayPage.getByLabel('字体大小', { exact: true }); await range.focus();
    for (let index = 0; index < 6; index++) await range.press('ArrowRight');
    ok(await overlay('window.desktopLyrics.updatePreferences({ color: "#abcdef", highlightColor: "#ffee33" })'));
    await eventually(state, value => value.preferences.fontSize === 38 && value.preferences.color === '#abcdef' && value.preferences.highlightColor === '#ffee33' && value.persistence === 'saved', 'real overlay appearance preferences committed');
    assert.equal(await overlayPage.getByLabel('歌词颜色', { exact: true }).inputValue(), '#abcdef');
    assert.equal(await overlayPage.getByLabel('逐词高亮颜色', { exact: true }).inputValue(), '#ffee33');
    const computed = await eventually(() => overlay(`({ color: getComputedStyle(document.querySelector('.dl-lines')).color, highlight: getComputedStyle(document.querySelector('.dl-word-active')).color, size: getComputedStyle(document.querySelector('.dl-current')).fontSize })`), value => value.color === 'rgb(171, 205, 239)' && value.highlight === 'rgb(255, 238, 51)' && value.size === '38px', 'computed font and colors');
    const move = await instance.evaluate(({ BrowserWindow, screen }, url) => {
      const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === url), before = window.getBounds(), area = screen.getPrimaryDisplay().workArea;
      const point = { x: area.x + Math.min(120, Math.max(0, area.width - before.width)), y: area.y + Math.min(140, Math.max(0, area.height - before.height)) };
      if (point.x === before.x && point.y === before.y) { point.x = area.x; point.y = area.y; }
      window.setPosition(point.x, point.y, false); return { before, requested: point, after: window.getBounds(), method: 'native setPosition, production move persistence; not pointer drag' };
    }, overlayUrl);
    assert.notDeepEqual({ x: move.before.x, y: move.before.y }, move.requested, 'must really move the window'); assert.deepEqual({ x: move.after.x, y: move.after.y }, move.requested);
    await eventually(async () => (await persisted()).preferences.position, value => value.x === move.requested.x && value.y === move.requested.y, 'native move saved by real dedicated store');
    const disk = await persisted('preferences-before-quit'); expectedPreferences = disk.preferences;
    assert.equal(expectedPreferences.fontSize, 38); assert.equal(expectedPreferences.color, '#abcdef'); assert.equal(expectedPreferences.highlightColor, '#ffee33'); assert.equal(expectedPreferences.visible, true); assert.equal(expectedPreferences.locked, false); assert.deepEqual((await state()).preferences, expectedPreferences);
    await screenshot('styled-and-moved', overlayUrl);
    return { move, computed, preferenceChangeMethod: 'real keyboard font slider; dedicated overlay preload color patch (not native color-picker UI)', dedicatedStore: store, preferences: expectedPreferences, bytes: disk.bytes, sha256: disk.sha256, persistedKeys: Object.keys(expectedPreferences).sort() };
  });
  await run(7, async () => {
    const before = await state();
    const reloadCompletion = await instance.evaluate(async ({ BrowserWindow }, { id, url }) => {
      const contents = BrowserWindow.fromId(id).webContents;
      await new Promise((resolve, reject) => {
        const finish = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error('Owned primary reload failed')); };
        const timeout = setTimeout(() => { cleanup(); reject(new Error('Owned primary reload did not finish')); }, 10000);
        const cleanup = () => { clearTimeout(timeout); contents.removeListener('did-finish-load', finish); contents.removeListener('did-fail-load', failed); };
        contents.once('did-finish-load', finish); contents.once('did-fail-load', failed); contents.reload();
      });
      return { actualDidFinishLoad: true, exactUrl: contents.getURL() === url };
    }, { id: primaryId, url: primaryUrl });
    assert.equal(reloadCompletion.exactUrl, true);
    const after = await eventually(async () => { try { return await overlay('window.desktopLyrics.state()'); } catch { return null; } }, value => value?.ok === true && value.data.snapshot.epoch > before.snapshot.epoch && value.data.snapshot.generation === 0
      && ['track', 'anchor', 'current', 'next'].every(key => value.data.snapshot[key] === null), 'real primary reload establishes fresh epoch and actual App automatic generation-zero clear');
    const delayed = { ...publication, generation: 999, sequence: 999 };
    const fresh = { epoch: after.data.snapshot.epoch, generation: 1, sequence: 0, track: { key: 'synthetic-after-reload-one', title: '新文档合成一代', artist: '离线合成' }, clock: { positionMs: 1100, playing: false, rate: 1 }, current: { timeMs: 1000, text: '新来源 · generation 1' }, next: { timeMs: 3000, text: '新文档下一行' } };
    // The actual primary App now owns the initial clear. A synthetic source must
    // NOT resurrect its closed generation zero or collide with its sequence zero.
    // Use a newer sequence so STALE proves the closed generation cannot revive,
    // not merely that its sequence zero was already consumed by the real App.
    const duplicateZero = await primary(`window.desktop.desktopLyrics.publish(${JSON.stringify({ ...fresh, generation: 0, sequence: 999 })})`);
    assert.equal(duplicateZero.ok, false); assert.equal(duplicateZero.error.code, 'STALE');
    assert.equal((await state()).snapshot.track, null);
    ok(await primary(`window.desktop.desktopLyrics.publish(${JSON.stringify(fresh)})`)); await eventually(() => overlayPage.locator('.dl-current').textContent(), value => value === fresh.current.text, 'newer synthetic generation/sequence-zero source accepted after automatic clear');
    const rejected = await primary(`window.desktop.desktopLyrics.publish(${JSON.stringify(delayed)})`); assert.equal(rejected.ok, false); assert.equal(rejected.error.code, 'STALE');
    const retained = await state(); assert.equal(retained.snapshot.generation, 1); assert.equal(retained.snapshot.track.key, fresh.track.key); assert.equal(await overlayPage.locator('.dl-current').textContent(), fresh.current.text); publication = fresh;
    return { reloadCompletion, epochBefore: before.snapshot.epoch, epochAfter: after.data.snapshot.epoch, automaticEmptyGeneration: 0, zeroRevivalSequence: 999, zeroRevivalCode: duplicateZero.error.code, syntheticNewGeneration: 1, newSequence: 0, delayedOldEpoch: delayed.epoch, delayedOldGeneration: 999, oldEpochCode: rejected.error.code, retainedTrack: retained.snapshot.track.key };
  });
  await run(8, async () => {
    const before = await state();
    const denial = await instance.evaluate(async ({ BrowserWindow, session }, { url, preload, publication }) => {
      // Real compiled primary preload at IDENTICAL primary URL, but another native window.
      // Block only this QA window's document assets: do not run unrelated app business handlers.
      const isolated = session.fromPartition('wmusic-qa-wrong-window-' + Date.now(), { cache: false }); isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      isolated.webRequest.onBeforeRequest((details, done) => done({ cancel: details.resourceType !== 'mainFrame' || details.url !== url }));
      const alien = new BrowserWindow({ show: false, webPreferences: { preload, session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
      try {
        await alien.loadURL(url); const execute = expression => alien.webContents.executeJavaScript(expression);
        return { id: alien.id, url: alien.webContents.getURL(), boundary: await execute('({ node: typeof process, publisher: typeof window.desktop.desktopLyrics, genericInvoke: typeof window.desktop.invoke })'), state: await execute('window.desktop.desktopLyrics.state()'), preferences: await execute('window.desktop.desktopLyrics.updatePreferences({ fontSize: 50 })'), publish: await execute('window.desktop.desktopLyrics.publish(' + JSON.stringify(publication) + ')') };
      } finally { alien.destroy(); isolated.webRequest.onBeforeRequest(null); }
    }, { url: primaryUrl, preload: join(repo, 'out/preload/index.cjs'), publication: { ...publication, sequence: 1 } });
    assert.equal(denial.url, primaryUrl); assert.notEqual(denial.id, primaryId); assert.deepEqual(denial.boundary, { node: 'undefined', publisher: 'object', genericInvoke: 'undefined' });
    for (const capability of ['state', 'preferences', 'publish']) { assert.equal(denial[capability].ok, false); assert.equal(denial[capability].error.code, 'DENIED'); }
    const retained = await state(); assert.deepEqual(retained.preferences, before.preferences); assert.deepEqual(retained.snapshot, before.snapshot); assert.equal((await nativeWindows()).length, 2);
    const media = await overlay('window.__wmusicQaMedia'); assert.deepEqual(media, { audioConstructions: 0, playCalls: 0 }); assert.equal(await overlayPage.locator('audio,video').count(), 0);
    return { denial, retainedTrack: retained.snapshot.track.key, overlayMedia: media };
  });
  await run(9, async () => {
    assert.ok((await state()).snapshot.track, 'transient publication must exist before restart');
    const quit = await exitAndVerify('primary window.desktop.app.quit() IPC'), afterQuit = await persisted('preferences-after-quit'); assert.deepEqual(afterQuit.preferences, expectedPreferences);
    const restarted = await launch(); assert.notEqual(restarted.startupEvidence.pid, quit.pid, 'restart must be separate real process');
    const restored = await state(); assert.deepEqual(restored.preferences, expectedPreferences); assert.equal(restored.shown, true); for (const key of ['track', 'anchor', 'current', 'next']) assert.equal(restored.snapshot[key], null);
    assert.ok(restored.snapshot.generation === null || restored.snapshot.generation === 0, 'a restarted primary may already have emitted its actual empty generation-zero clear, never an old active generation');
    await overlayReady(); const windows = await rememberNative(), native = windows.find(window => window.url === overlayUrl); assert.equal(native.visible, true); assert.deepEqual({ x: native.bounds.x, y: native.bounds.y }, expectedPreferences.position); assert.equal(await overlayPage.locator('.dl-current').textContent(), '尚未播放');
    const computed = await overlay(`({ font: getComputedStyle(document.querySelector('.dl-current')).fontSize, color: getComputedStyle(document.querySelector('.dl-lines')).color, highlight: getComputedStyle(document.querySelector('.desktop-lyrics')).getPropertyValue('--dl-highlight').trim() })`);
    assert.deepEqual(computed, { font: '38px', color: 'rgb(171, 205, 239)', highlight: '#ffee33' }); const disk = await persisted('preferences-after-restart'); assert.equal(disk.sha256, afterQuit.sha256, 'restart must read same dedicated JSON bytes');
    await screenshot('restarted-persisted-preferences', overlayUrl); await screenshot('restarted-primary-offline', primaryUrl);
    return { quit, restartedPid: restarted.startupEvidence.pid, sameUserData: restarted.startupEvidence.userData, preferences: restored.preferences, transientSnapshot: restored.snapshot, nativePosition: expectedPreferences.position, storeSha256AfterQuit: afterQuit.sha256, storeSha256AfterRestart: disk.sha256, computed };
  });
  await run(10, async () => {
    const settings = ok(await primary('window.desktop.settings.get()')); assert.equal(settings.closeBehavior, 'quit', 'fresh default must be quit; do not override it'); assert.equal((await state()).shown, true); assert.deepEqual(report.rendererErrors, [], 'actual primary/overlay must not throw renderer exceptions');
    return exitAndVerify('native primary BrowserWindow.close() with default quit behavior');
  });
  assert.equal(report.passed.length, labels.length);
} catch (error) { fail(error); }
finally {
  // Always record both inventories, including failures. Drift invalidates acceptance.
  try {
    report.outputSha256After = await fingerprint(join(repo, 'out')); report.outputInventorySha256After = sha256(JSON.stringify(report.outputSha256After)); report.outputFingerprintUnchanged = JSON.stringify(report.outputSha256After) === JSON.stringify(report.outputSha256);
    await mkdir(evidence, { recursive: true }); await writeFile(join(evidence, 'out-after.json'), JSON.stringify(report.outputSha256After, null, 2) + '\n'); assert.equal(report.outputFingerprintUnchanged, true, 'compiled outputs changed; evidence INVALID');
  } catch (error) { fail(error); }
  for (const record of launches) {
    try {
      // Cleanup only, never proof of an explicit quit/default-close acceptance step.
      if (record.child && record.child.exitCode === null && record.child.signalCode === null) await Promise.race([record.instance.close().catch(() => {}), sleep(5000)]);
      if (!record.pids.length) record.pids.push(JSON.parse(await readFile(record.startup, 'utf8')).pid);
      let live = nativeLiveness(record.pids, record.windows);
      if (live.alivePids.length) { record.forcedCleanup = true; for (const pid of live.alivePids) spawnSync('taskkill.exe', ['/pid', String(pid), '/T', '/F'], { encoding: 'utf8', env, timeout: 10000, windowsHide: true }); }
      live = await eventually(() => Promise.resolve(nativeLiveness(record.pids, record.windows)), value => !value.alivePids.length && !value.liveWindows.length, 'unconditional native cleanup', 7500);
      report.processes.push({ number: record.number, pid: record.startupEvidence?.pid || record.pids[0], launcherPid: record.child?.pid, trackedPids: record.pids, windows: record.windows, exitedNaturally: record.exitedNaturally, exitCode: record.child?.exitCode ?? record.exitCode, signalCode: record.child?.signalCode ?? record.signalCode, forcedCleanup: record.forcedCleanup === true, quitTrigger: record.quitTrigger, startupEvidence: record.startupEvidence, bootstrapSha256: record.bootstrapSha256, lifecycle: record.lifecycle, cleanup: live });
    } catch (error) { fail(error); }
  }
  report.processExited = report.processes.length === launches.length && report.processes.every(record => !record.cleanup.alivePids.length && !record.cleanup.liveWindows.length);
  for (const directory of [profile, runtime]) { try { await rm(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 }); } catch (error) { fail(error); } }
  try {
    const absent = path => stat(path).then(() => false, error => { if (error.code === 'ENOENT') return true; throw error; }); report.profileRemoved = await absent(profile); report.runtimeRemoved = await absent(runtime); assert.equal(report.processExited && report.profileRemoved && report.runtimeRemoved, true, 'process/profile/runtime cleanup incomplete');
  } catch (error) { fail(error); }
  report.unexecutedCases = labels.filter(label => !report.steps.some(step => step.label === label)); report.completedCases = report.passed.length;
  report.accepted = report.completedCases === labels.length && !report.errors.length && !report.rendererErrors.length && report.outputFingerprintUnchanged && report.processExited && report.profileRemoved && report.runtimeRemoved && report.processes.every(record => record.exitedNaturally && !record.forcedCleanup);
  if (!report.accepted) process.exitCode = 1;
  report.finishedAt = new Date().toISOString(); await mkdir(evidence, { recursive: true }); await writeFile(join(evidence, 'evidence.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ accepted: report.accepted, completedCases: report.completedCases, requiredCases: labels.length, passed: report.passed, errors: report.errors, evidence: join(evidence, 'evidence.json'), outputInventorySha256Before: report.outputInventorySha256Before, outputInventorySha256After: report.outputInventorySha256After, processExited: report.processExited, profileRemoved: report.profileRemoved, runtimeRemoved: report.runtimeRemoved }));
}
