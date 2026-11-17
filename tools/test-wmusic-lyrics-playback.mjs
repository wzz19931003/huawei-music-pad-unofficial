// Maintained Windows acceptance: compiled REAL main/preloads/player/Audio/publisher/overlay.
// Run: node tools/test-wmusic-lyrics-playback.mjs (requires a separately built, frozen out/).
// Tight diagnostic only: append --epoch-only (NOT the 11-case Audio acceptance).
// NEVER builds, changes production, publishes lyric DTOs, connects services, or uses a real profile.
// Test-only bootstrap contains the real main; fixtures replace ONLY named business IPC handlers.
// DOM/native observations are not a packaged, installer, audible-output, or live-account certificate.
import assert from 'node:assert/strict';
import electron from 'electron';
import { _electron } from 'playwright-core';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Do not prefer inherited TMPDIR: on Windows it can be an 8.3 system-Temp alias.
const scratch = resolve(process.env.HERMES_QA_SCRATCH || (process.platform === 'win32'
  ? join(homedir(), 'AppData/Local/hermes/cache/scratch') : process.env.TMPDIR || ''));
assert.ok(process.platform === 'win32' || process.env.HERMES_QA_SCRATCH || process.env.TMPDIR, 'designated scratch required');
await mkdir(scratch, { recursive: true });
const root = await mkdtemp(join(scratch, 'wmusic-lyrics-playback-'));
const profile = join(root, 'profile'), runtime = join(root, 'runtime'), evidence = join(root, 'evidence');
const primaryUrl = pathToFileURL(join(repo, 'out/renderer/index.html')).href;
const overlayUrl = pathToFileURL(join(repo, 'out/renderer/desktop-lyrics.html')).href;
const epochDiagnostic = process.argv.includes('--epoch-only');
const labels = epochDiagnostic ? ['playing-source primary reload resets old-generation data in a new native publication epoch'] : [
  'real compiled main containment; fresh-document singleton native Audio and literal business fixtures',
  'actual primary playerbar lyric button opens/hides/reopens the real isolated native overlay',
  'Favorites Play All produces trusted native metadata/playing events and automatic source publication',
  'pause, real keyboard seek/backward motion, source next/translation/word marks mirror without fake DTOs',
  'held Next advances React selection but retains old playing Audio/title/lyrics/generation until source B commits',
  'real native ended (not dispatched by test) advances list playback and the automatic mirror',
  'hidden and minimized primary keep visible overlay receiving source-clock samples and line progression',
  '960x640 and 1320x840 mini/full player controls stay visible with 44px button targets and separate volume slider',
  'actual queue controls empty the queue, stop native Audio, and automatically clear native words/clock',
  'real primary reload changes document/epoch, removes stale words, and mints new document-owned WAV Blobs',
  'actual application quit destroys owned primary/overlay and exits without a forced kill',
];
const report = { scope: 'actual compiled main + real preloads, renderer, singleton native Audio, AUTOMATIC publisher and native overlay; offline synthetic business IPC only',
  mode: epochDiagnostic ? 'playing-source reload diagnostic; NOT full 11-case Audio acceptance' : 'full 11-case Audio acceptance',
  exclusions: ['live login/account/service/CDN', 'real music or audible sound', 'payment', 'build/package/installer', 'physical mouse/taskbar interaction', 'queue persistence across processes', 'forced Audio.muted=true background progression (separately observed native pause); actual zero-volume background progression (not exercised): neither is certified by the zero-PCM unmuted progression case'],
  mediaFixturePolicy: { pcmSamplesAllZero: true, forcedElementMute: false, nativeConstructorStateUnchanged: true,
    reason: 'Generated zero-PCM WAVs are already silent. Forcing Audio.muted in instrumentation changes native Chromium hidden-media policy; preserve that separate failed variant rather than changing production scheduling or certifying it here.' },
  root, scratch, profile, runtime, primaryUrl, overlayUrl, plannedCases: labels, steps: [], passed: [], errors: [], rendererErrors: [],
  consoleErrors: [], mainErrors: [], screenshots: [], frames: [], geometry: [], background: [], fingerprintChecks: [], actions: [],
  manualLyricPublications: 0, processExited: false, profileRemoved: false, runtimeRemoved: false };
const env = { ...process.env, TMPDIR: scratch, TMP: scratch, TEMP: scratch };
for (const key of Object.keys(env)) if (/^(?:HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|ELECTRON_RUN_AS_NODE|HWMUSIC_USE_SYSTEM_PROXY|NODE_TLS_REJECT_UNAUTHORIZED)$/i.test(key)) delete env[key];
const sleep = ms => new Promise(done => setTimeout(done, ms));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const scrub = value => String(value).replace(/(?:blob:|https?:\/\/|wss?:\/\/)[^\s\"'<>)]*/gi, '[redacted-network-or-media-url]');
const failure = error => { const message = scrub(error?.stack || error); report.errors.push(message); process.exitCode = 1; console.error(message); };
const pidRecord = { pids: [], windows: [], exitedNaturally: false, forcedCleanup: false };
let instance, child, primaryId, primaryPage, channels, lyricChannels;
let lastForeground, generationA, generationB, epochBeforeReload;

// Stable, clearly synthetic source documents; all marks are supplied here, never invented by a clock.
const fixtures = ['A', 'B'].map((source, index) => ({ source,
  track: { id: `wmusic-offline-source-${source}`, title: `离线合成音频 ${source}`, artists: [{ name: '本地静音验收' }], durationSeconds: 80, available: true },
  lyrics: { synced: true, source: 'local', lines: Array.from({ length: 20 }, (_, line) => {
    const head = index ? '乙' : '甲', suffix = String(line).padStart(2, '0'), timeMs = line * 4000;
    const value = { timeMs, text: `${head}源${suffix}`, translation: `Synthetic ${source} translation ${suffix}` };
    // Row 2 deliberately has NO source word marks: the mirror must not synthesize them.
    if (line !== 2) value.segments = [{ timeMs, text: head }, { timeMs: timeMs + 1000, text: '源' }, { timeMs: timeMs + 2200, text: suffix }];
    return value;
  }) },
}));
const sourceFixture = source => { const fixture = fixtures.find(item => item.source === source); assert.ok(fixture, 'unknown synthetic source'); return fixture; };
const linePair = (source, positionMs) => {
  const lines = sourceFixture(source).lyrics.lines;
  const index = lines.findLastIndex(line => line.timeMs <= positionMs);
  return { current: index < 0 ? null : lines[index], next: lines[index + 1] || null };
};
async function inventory(directory, prefix = '') {
  const result = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const key = prefix + entry.name, path = join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(result, await inventory(path, key + '/'));
    else { const bytes = await readFile(path); result[key] = { bytes: bytes.length, sha256: hash(bytes) }; }
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
async function frozen(label) {
  const actual = await inventory(join(repo, 'out'));
  report.fingerprintChecks.push({ label, sha256: hash(JSON.stringify(actual)), at: new Date().toISOString() });
  assert.deepEqual(actual, report.outBefore, 'out/ changed during probe: evidence INVALID; never rebuild or relax this comparator');
}
async function bounded(promise, label, timeout = 10000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeout); })]); }
  finally { clearTimeout(timer); }
}
async function eventually(read, predicate, label, timeout = 10000) {
  const deadline = Date.now() + timeout; let value;
  do { value = await read(); if (predicate(value)) return value; await sleep(160); } while (Date.now() < deadline);
  assert.fail(`${label}: ${scrub(JSON.stringify(value))}`);
}
async function documentEval(url, fn, argument) {
  const expression = typeof fn === 'string' ? fn : `(${fn.toString()})(${JSON.stringify(argument) ?? 'undefined'})`;
  return bounded(instance.evaluate(({ BrowserWindow }, { url, primaryId, expression, primaryUrl }) => {
    const window = url === primaryUrl ? BrowserWindow.fromId(primaryId) : BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === url);
    if (!window || window.isDestroyed() || window.webContents.getURL() !== url) throw new Error('Exact owned document unavailable');
    return window.webContents.executeJavaScript(expression);
  }, { url, primaryId, expression, primaryUrl }), 'exact owned webContents.executeJavaScript');
}
const primary = (fn, arg) => documentEval(primaryUrl, fn, arg);
const overlay = (fn, arg) => documentEval(overlayUrl, fn, arg);
function ok(value) { assert.equal(value?.ok, true, scrub(JSON.stringify(value))); return value.data; }
const state = () => overlay(() => window.desktopLyrics.state()).then(ok);
const primaryState = () => primary(() => window.desktop.desktopLyrics.state()).then(ok);
async function run(index, body) {
  const step = { label: labels[index], status: 'running', startedAt: new Date().toISOString() }; report.steps.push(step);
  try { await frozen(`before ${index + 1}`); step.observed = await body(); await frozen(`after ${index + 1}`); step.status = 'passed'; report.passed.push(step.label); console.log('PASS ' + step.label); }
  catch (error) { step.status = 'failed'; step.error = scrub(error?.stack || error); throw error; }
  finally { step.finishedAt = new Date().toISOString(); }
}
// Button.click() fallback still invokes the real visible React control. No player/preload control API is called.
async function click(selector, text = null, url = primaryUrl) {
  // Native state can change before the owning React action's finally clears its
  // busy latch. Wait for the real control, never bypass disabled or call IPC.
  await eventually(() => documentEval(url, ({ selector, text }) => {
    const matches = [...document.querySelectorAll(selector)].filter(element => text === null || element.textContent.trim() === text);
    if (matches.length !== 1) return { count: matches.length, ready: false };
    const element = matches[0], rect = element.getBoundingClientRect();
    return { count: 1, ready: !element.disabled && !element.closest('[inert],[aria-hidden="true"]') && rect.width > 0 && rect.height > 0 };
  }, { selector, text }), value => value.ready, `actual visible enabled control ${selector} / ${text}`);
  const result = await documentEval(url, ({ selector, text }) => {
    const matches = [...document.querySelectorAll(selector)].filter(element => text === null || element.textContent.trim() === text);
    if (matches.length !== 1) throw new Error(`Expected one actual control ${selector} / ${text}; found ${matches.length}`);
    const element = matches[0], rect = element.getBoundingClientRect();
    if (element.disabled || element.closest('[inert],[aria-hidden="true"]') || !rect.width || !rect.height) throw new Error('Actual control is disabled/hidden/inert');
    element.click(); return { selector, text, label: element.getAttribute('aria-label'), method: 'real DOM control .click(), not a player or lyric IPC call' };
  }, { selector, text });
  report.actions.push(result); return result;
}
async function press(selector, key, count = 1) {
  if (primaryPage && !primaryPage.isClosed()) {
    await primaryPage.locator(selector).focus();
    for (let index = 0; index < count; index++) await primaryPage.locator(selector).press(key);
  } else {
    await primary(selector => { const element = document.querySelector(selector); if (!element || element.disabled) throw new Error('Actual keyboard control missing/disabled'); element.focus(); }, selector);
    const keyCode = { Home: 'HOME', End: 'END', ArrowRight: 'RIGHT', ArrowLeft: 'LEFT' }[key]; assert.ok(keyCode, 'unmapped native key');
    await instance.evaluate(({ BrowserWindow }, { id, url, keyCode, count }) => {
      const window = BrowserWindow.fromId(id); if (window.webContents.getURL() !== url) throw new Error('Wrong primary document');
      for (let index = 0; index < count; index++) { window.webContents.sendInputEvent({ type: 'keyDown', keyCode }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode }); }
    }, { id: primaryId, url: primaryUrl, keyCode, count });
  }
  report.actions.push({ selector, key, count, method: primaryPage ? 'real keyboard via Playwright' : 'exact primary native sendInputEvent fallback' });
}
const bar = '.desktop-playerbar';
const seekSelector = `${bar} input[aria-label="播放进度"]`;
async function seek(seconds) {
  const contract = await primary(selector => { const range = document.querySelector(selector); return range ? { step: Number(range.step), max: Number(range.max), disabled: range.disabled } : null; }, seekSelector);
  assert.ok(contract && !contract.disabled && contract.step > 0 && seconds < contract.max, 'real loaded native duration/seek slider required');
  await press(seekSelector, 'Home');
  await press(seekSelector, 'ArrowRight', Math.round(seconds / contract.step));
  return eventually(() => primary(() => window.__wmusicPlaybackQa.sample()), sample => !sample.audio[0]?.seeking && Math.abs(sample.audio[0]?.currentTime - seconds) < 0.45, 'native Audio reached real keyboard seek target');
}
async function pause() {
  const before = await primary(() => window.__wmusicPlaybackQa.sample());
  if (!before.audio[0].paused) await click(`${bar} button[aria-label="暂停"]`);
  return eventually(() => primary(() => window.__wmusicPlaybackQa.sample()), value => value.audio[0].paused, 'native Audio paused through actual control');
}
async function play() {
  const before = await primary(() => window.__wmusicPlaybackQa.sample());
  if (before.audio[0].paused) await click(`${bar} button[aria-label="播放"]`);
  return eventually(() => primary(() => window.__wmusicPlaybackQa.sample()), value => !value.audio[0].paused && value.audio[0].readyState >= 3 && value.trustedEvents.playing > 0, 'trusted native playing event after actual Play');
}
async function screenshot(name, url) {
  const image = await eventually(async () => {
    try { return await bounded(instance.evaluate(async ({ BrowserWindow }, url) => {
      const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === url);
      if (!window?.isVisible() || window.isMinimized()) return null;
      if (!await window.webContents.executeJavaScript('document.readyState === "complete" && !!document.body?.children.length')) return null;
      return { id: window.id, bounds: window.getBounds(), png: (await window.webContents.capturePage()).toPNG().toString('base64') };
    }, url), 'native owned-window capture'); }
    catch (error) { if (!String(error).includes('UnknownVizError')) throw error; report.captureRetries ??= []; report.captureRetries.push({ name, reason: 'first compositor frame UnknownVizError' }); return null; }
  }, Boolean, 'owned visible compositor frame', 5000);
  const bytes = Buffer.from(image.png, 'base64'), path = join(evidence, `${name}.png`); assert.ok(bytes.length > 100);
  await writeFile(path, bytes); report.screenshots.push({ path, windowId: image.id, bounds: image.bounds, bytes: bytes.length, sha256: hash(bytes), method: 'owned webContents.capturePage only' });
}
function python(program, argument) {
  const result = spawnSync('python3', ['-c', program, JSON.stringify(argument)], { env, encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(result.status, 0, scrub(result.error?.message || result.stderr || 'native Python probe failed')); return JSON.parse(result.stdout.trim());
}
const liveness = () => python(`import ctypes,json,sys
q=json.loads(sys.argv[1]); k=ctypes.WinDLL('kernel32',use_last_error=True); u=ctypes.WinDLL('user32',use_last_error=True)
k.OpenProcess.argtypes=[ctypes.c_uint32,ctypes.c_int,ctypes.c_uint32]; k.OpenProcess.restype=ctypes.c_void_p
k.WaitForSingleObject.argtypes=[ctypes.c_void_p,ctypes.c_uint32]; k.WaitForSingleObject.restype=ctypes.c_uint32
k.CloseHandle.argtypes=[ctypes.c_void_p]; u.IsWindow.argtypes=[ctypes.c_void_p]; u.IsWindow.restype=ctypes.c_int
alive=[]
for pid in q['pids']:
 h=k.OpenProcess(0x100000,False,pid)
 if h:
  if k.WaitForSingleObject(h,0)==258: alive.append(pid)
  k.CloseHandle(h)
 else: assert ctypes.get_last_error() in (0,87), 'cannot verify exact owned PID'
print(json.dumps({'alivePids':alive,'liveWindows':[v for v in q['windows'] if u.IsWindow(ctypes.c_void_p(int(v['hwnd'])))]}))`, { pids: [...new Set(pidRecord.pids)], windows: pidRecord.windows });
async function rememberNative() {
  const value = await instance.evaluate(({ BrowserWindow, app }) => ({ pids: [process.pid, ...app.getAppMetrics().map(metric => metric.pid)], windows: BrowserWindow.getAllWindows().map(window => {
    const handle = window.getNativeWindowHandle();
    return { id: window.id, url: window.webContents.getURL(), hwnd: handle.length >= 8 ? handle.readBigUInt64LE().toString() : handle.readUInt32LE().toString(),
      visible: window.isVisible(), minimized: window.isMinimized(), bounds: window.getBounds() };
  }) }));
  pidRecord.pids = [...new Set([...pidRecord.pids, ...value.pids])];
  pidRecord.windows = [...new Map([...pidRecord.windows, ...value.windows].map(window => [window.hwnd, window])).values()]; return value.windows;
}

// Installed BEFORE the fixture reload and BEFORE overlay creation. Real native methods are delegated unchanged.
function observeMedia() {
  if (window.__wmusicPlaybackQa) return;
  const audios = [], events = [], counts = {}, trustedEvents = {}, labels = new Map();
  let assignments = 0, playCalls = 0, createdMedia = 0;
  const doc = crypto.randomUUID();
  const sourceOf = audio => !audio.getAttribute('src') ? 'empty' : labels.get(audio.currentSrc || audio.src) || labels.get(audio.src) || 'unrecognized';
  const observe = (type, audio, event) => {
    counts[type] = (counts[type] || 0) + 1;
    if (event?.isTrusted) trustedEvents[type] = (trustedEvents[type] || 0) + 1;
    events.push({ type, source: sourceOf(audio), atMs: Date.now(), currentTime: audio.currentTime, readyState: audio.readyState, paused: audio.paused, trusted: event?.isTrusted === true, errorCode: audio.error?.code || null });
    if (events.length > 256) events.shift();
  };
  const NativeAudio = window.Audio;
  window.Audio = new Proxy(NativeAudio, { construct(target, args) {
    const audio = Reflect.construct(target, args); audios.push(audio);
    for (const type of ['loadedmetadata', 'loadeddata', 'playing', 'pause', 'timeupdate', 'seeking', 'seeked', 'ended', 'error', 'emptied', 'ratechange', 'volumechange']) audio.addEventListener(type, event => observe(type, audio, event));
    return audio;
  } });
  const createElement = document.createElement;
  document.createElement = function (...args) { if (/^(audio|video)$/i.test(args[0])) createdMedia++; return Reflect.apply(createElement, this, args); };
  const createElementNS = document.createElementNS;
  document.createElementNS = function (...args) { if (/^(audio|video)$/i.test(args[1])) createdMedia++; return Reflect.apply(createElementNS, this, args); };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) { playCalls++; return Reflect.apply(play, this, args); };
  const src = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  Object.defineProperty(HTMLMediaElement.prototype, 'src', { ...src, set(value) { Reflect.apply(src.set, this, [value]); assignments++; observe('src-assigned', this); } });
  window.__wmusicPlaybackQa = { labels, audios, doc, sample() { return {
    document: doc, sampledAtMs: Date.now(), visibility: document.visibilityState, focused: document.hasFocus(), audioConstructions: audios.length, createdMedia, mediaElements: document.querySelectorAll('audio,video').length,
    assignments, playCalls, events: events.slice(-32), counts: { ...counts }, trustedEvents: { ...trustedEvents },
    audio: audios.map(audio => ({ native: audio instanceof HTMLAudioElement && audio instanceof HTMLMediaElement, source: sourceOf(audio),
      currentTime: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : null, paused: audio.paused, seeking: audio.seeking,
      ended: audio.ended, readyState: audio.readyState, muted: audio.muted, volume: audio.volume, rate: audio.playbackRate, errorCode: audio.error?.code || null })),
  }; } };
}
function installBusinessFixtures({ ipcMain, BrowserWindow }, { channels, primaryId, primaryUrl, fixtures }) {
  const byId = new Map(fixtures.map(fixture => [fixture.track.id, fixture]));
  const qa = globalThis.__wmusicPlaybackMain;
  qa.business = { calls: [], forbidden: [], favorites: new Set(byId.keys()), urls: {}, bindingDocument: null, holdB: false, held: null, queue: null };
  const business = qa.business, ok = data => ({ ok: true, data });
  const guard = event => {
    const window = BrowserWindow.fromId(primaryId);
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame
      || event.senderFrame.parent !== null || event.senderFrame.url !== primaryUrl || window.webContents.getURL() !== primaryUrl) throw new Error('QA fixture rejected non-exact primary sender/document');
  };
  const replace = (name, handler) => {
    if (typeof channels[name] !== 'string') throw new Error('Fixture literal channel not discovered');
    ipcMain.removeHandler(channels[name]); ipcMain.handle(channels[name], (event, input) => { guard(event); return handler(input, event); });
  };
  const record = (kind, source = null) => { business.calls.push({ kind, source, atMs: Date.now() }); if (business.calls.length > 200) business.calls.shift(); };
  const fixtureFor = id => { const fixture = byId.get(id); if (!fixture) throw new Error('Unknown synthetic source identifier'); return fixture; };
  replace('authStatus', () => ok({ authenticated: true, displayName: '离线合成验收', persistence: 'memory-only' }));
  for (const name of ['authLogin', 'authLogout', 'authCancelLogin', 'updatesCheck', 'updatesDownload', 'updatesInstall', 'musicCreatePlaylist', 'musicUpdatePlaylistDescription', 'musicDeletePlaylist']) replace(name, () => {
    business.forbidden.push(name); throw new Error('Offline acceptance must never initiate login/update/account/library-write flow');
  });
  replace('musicFavorites', ({ start = 0, limit = 50 } = {}) => {
    const tracks = fixtures.filter(fixture => business.favorites.has(fixture.track.id)).map(fixture => fixture.track);
    const rows = tracks.slice(start, start + limit); record('favorites'); return ok({ tracks: rows, nextStart: start + rows.length, hasMore: start + rows.length < tracks.length });
  });
  replace('musicFavoritesSummary', () => ok({ total: business.favorites.size }));
  replace('musicHistory', () => ok({ tracks: [] }));
  replace('musicPlaylists', () => ok({ playlists: [], truncated: false }));
  replace('musicFavoriteState', ({ trackId }) => ok({ favorite: business.favorites.has(fixtureFor(trackId).track.id) }));
  replace('musicSetFavorite', ({ trackId, favorite }) => {
    const fixture = fixtureFor(trackId); if (favorite) business.favorites.add(trackId); else business.favorites.delete(trackId);
    record('favorite-write', fixture.source); return ok({ favorite: business.favorites.has(trackId) });
  });
  replace('musicLyrics', ({ trackId }) => { const fixture = fixtureFor(trackId); record('lyrics', fixture.source); return ok(fixture.lyrics); });
  replace('musicResolvePlayback', ({ trackId, quality }, event) => {
    const fixture = fixtureFor(trackId); record('resolve-request', fixture.source);
    if (!['standard', 'lossless'].includes(quality) || !business.urls[fixture.source]) throw new Error('Current document WAV binding required before actual Play');
    const reply = () => { record('resolve-reply', fixture.source); return ok({ url: business.urls[fixture.source], actualQuality: 'unknown', qualityEvidence: 'none', contentType: 'audio/wav', durationSeconds: 80 }); };
    if (fixture.source === 'B' && business.holdB) return new Promise(resolve => { if (business.held) throw new Error('Unexpected overlapping held resolve'); business.held = { source: 'B', resolve: () => { guard(event); resolve(reply()); business.held = null; business.holdB = false; } }; });
    return reply();
  });
  replace('musicReportPlayback', () => { record('synthetic-history-report'); return ok(undefined); });
  // Explicit document-empty queue fixture avoids resurrecting a revoked old-document Blob on reload.
  // Save observations are retained, but this harness does NOT claim real queue persistence.
  replace('queueLoad', () => ok(null));
  replace('queueSave', input => { business.queue = input; record('queue-save'); return ok(undefined); });
}
async function mintDocumentWavs() {
  const binding = await primary(() => {
    const qa = window.__wmusicPlaybackQa; if (!qa) throw new Error('Media observer missing in resulting document');
    const urls = {};
    for (const source of ['A', 'B']) {
      const rate = 8000, count = rate * 80, buffer = new ArrayBuffer(44 + count * 2), view = new DataView(buffer);
      const text = (at, text) => [...text].forEach((value, index) => view.setUint8(at + index, value.charCodeAt(0)));
      text(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
      view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, count * 2, true);
      const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' })); urls[source] = url; qa.labels.set(url, source);
    }
    return { document: qa.doc, urls };
  });
  await instance.evaluate((_electron, binding) => {
    const business = globalThis.__wmusicPlaybackMain.business; business.urls = binding.urls; business.bindingDocument = binding.document;
  }, binding);
  // Never persist or print the Blob URL mapping.
  report.documentBindings ??= []; report.documentBindings.push({ document: binding.document, sources: ['A', 'B'], durationSeconds: 80, sampleRateHz: 8000, channels: 1, pcmBits: 16, allSamplesZero: true, createdAfterReload: true });
  return binding.document;
}
async function waitBoot() {
  await eventually(() => primary(() => ({ ready: document.readyState, app: !!document.querySelector('.desktop-app'), boot: !!document.querySelector('.boot-screen'), audio: window.__wmusicPlaybackQa?.sample() })),
    value => value.ready === 'complete' && value.app && !value.boot && value.audio?.audioConstructions === 1, 'resulting fixture document and real singleton Audio');
}
async function reloadPrimary() {
  const oldDocument = await primary(() => window.__wmusicPlaybackQa?.doc || null);
  await instance.evaluate(({ BrowserWindow }, { id, url }) => { const window = BrowserWindow.fromId(id); if (window.webContents.getURL() !== url) throw new Error('Wrong reload target'); window.webContents.reload(); }, { id: primaryId, url: primaryUrl });
  await eventually(async () => { try { return await primary(old => typeof window.__wmusicPlaybackQa?.sample === 'function'
    && window.__wmusicPlaybackQa.doc !== old && !!document.querySelector('.desktop-app'), oldDocument); } catch { return false; } }, Boolean, 'different new primary document init script');
  await waitBoot(); return mintDocumentWavs();
}
async function sourceFrame(name, includePrimary = true) {
  const audioBefore = includePrimary ? await primary(() => window.__wmusicPlaybackQa.sample()) : null;
  const native = await state();
  const dom = await overlay(() => ({ current: document.querySelector('.dl-current')?.textContent, secondary: document.querySelector('.dl-secondary')?.textContent,
    translation: document.querySelector('.dl-secondary')?.getAttribute('data-translation'), word: Number(document.querySelector('.dl-lines')?.getAttribute('data-active-word')),
    wordText: document.querySelector('.dl-word-active')?.textContent || null, wordCount: document.querySelectorAll('.dl-word').length,
    stale: document.querySelector('.desktop-lyrics')?.getAttribute('data-stale'), title: document.querySelector('.dl-track')?.textContent, sampledAtMs: Date.now() }));
  const audioAfter = includePrimary ? await primary(() => window.__wmusicPlaybackQa.sample()) : null;
  const frame = { name, observedAtMs: Date.now(), audioBefore, native, dom, audioAfter }; report.frames.push(frame); return frame;
}
function assertSourceFrame(frame, source, paused = false) {
  const { native, dom, audioBefore, audioAfter } = frame, fixture = sourceFixture(source);
  assert.equal(native.shown, true); assert.equal(native.snapshot.track?.title, fixture.track.title, 'native title must describe actual Audio source, not React selection');
  assert.equal(native.snapshot.track.artist, fixture.track.artists[0].name);
  assert.equal(dom.title, `${fixture.track.title} · ${fixture.track.artists[0].name}`, 'visible native overlay title must match the committed source too');
  assert.equal(native.snapshot.track.key, `g:${native.snapshot.generation}`, 'wire identity is opaque generation, never provider/internal trackId');
  assert.deepEqual(Object.keys(native.snapshot).sort(), ['anchor', 'current', 'epoch', 'generation', 'next', 'track']);
  assert.deepEqual(Object.keys(native.snapshot.track).sort(), ['artist', 'key', 'title']);
  const anchor = native.snapshot.anchor; assert.ok(anchor && Number.isFinite(anchor.positionMs));
  const pair = linePair(source, anchor.positionMs); assert.deepEqual(native.snapshot.current, pair.current, 'exact source current line/translation/marks'); assert.deepEqual(native.snapshot.next, pair.next, 'exact source next line/translation/marks');
  if (audioBefore && audioAfter) {
    for (const sample of [audioBefore, audioAfter]) { assert.equal(sample.audioConstructions, 1); assert.equal(sample.audio.length, 1); assert.equal(sample.audio[0].native, true); assert.equal(sample.audio[0].source, source); assert.equal(sample.audio[0].muted, false, 'zero-PCM fixture must not impose the separately failing forced-mute policy'); }
    assert.equal(anchor.rate, audioAfter.audio[0].rate);
    const minimum = Math.min(audioBefore.audio[0].currentTime, audioAfter.audio[0].currentTime) * 1000;
    const maximum = Math.max(audioBefore.audio[0].currentTime, audioAfter.audio[0].currentTime) * 1000;
    assert.ok(anchor.positionMs >= minimum - 450 && anchor.positionMs <= maximum + 150, 'native anchor must sample real Audio.currentTime, not cached React position');
    if (paused) { assert.equal(anchor.playing, false); assert.ok(audioBefore.audio[0].paused && audioAfter.audio[0].paused); assert.ok(Math.abs(minimum - maximum) < 30); }
    else { assert.equal(anchor.playing, true); assert.equal(audioAfter.audio[0].paused, false); }
  }
  // During playback DOM may have consumed the immediately following native sample.
  // Permit only a narrow real observation interval, not arbitrary source membership.
  if (!paused) {
    const position = audioAfter ? audioAfter.audio[0].currentTime * 1000
      : anchor.positionMs + Math.min(1500, Math.max(0, dom.sampledAtMs - anchor.receivedAtMs)) * anchor.rate;
    const candidates = [Math.max(0, position - 450), position, position + 450].map(at => linePair(source, at).current);
    assert.ok(candidates.some(line => line?.text === dom.current), 'visible line must follow actual source clock, not a delayed arbitrary source line');
    if (dom.word >= 0) assert.ok(candidates.some(line => line?.text === dom.current && line.segments
      && line.segments[dom.word]?.text === dom.wordText), 'highlight must correspond to a source-provided mark, never fabricated word text');
  }
  if (paused) {
    assert.equal(dom.current, pair.current?.text || '前奏 · 等待歌词');
    assert.equal(dom.secondary, native.preferences.showTranslation && pair.current?.translation ? pair.current.translation : pair.next?.text || '\u00a0');
    const marks = pair.current?.segments, expectedWord = native.preferences.wordHighlight && marks ? marks.findLastIndex(mark => mark.timeMs <= anchor.positionMs) : -1;
    assert.equal(dom.word, expectedWord, 'only source-provided word timings may activate a mark');
    assert.equal(dom.wordCount, expectedWord >= 0 ? marks.length : 0);
  }
  assert.ok(!JSON.stringify(native).includes(fixture.track.id), 'internal trackId must not leak to overlay DTO');
}
async function settledSource(name, source, paused = false) {
  let lastError;
  const frame = await eventually(async () => {
    const frame = await sourceFrame(name);
    try { assertSourceFrame(frame, source, paused); return frame; } catch (error) { lastError = scrub(error.message); return null; }
  }, Boolean, `${name}: real source mirror`, 8000).catch(error => { throw new Error(`${error.message}; last source mismatch: ${lastError}`); });
  lastForeground = frame; return frame;
}
async function startFromFavorites() {
  await click('nav[aria-label="音乐库导航"] button', '我的收藏');
  await eventually(() => primary(() => [...document.querySelectorAll('.track-list .track-row')].length), value => value === fixtures.length, 'actual Favorites synthetic rows');
  await click('.favorites-head button', '播放全部');
  return eventually(() => primary(() => window.__wmusicPlaybackQa.sample()), value => value.audioConstructions === 1 && value.audio[0].source === 'A'
    && value.audio[0].readyState >= 3 && !value.audio[0].paused && value.trustedEvents.loadedmetadata > 0 && value.trustedEvents.playing > 0, 'real native metadata + playing after Favorites Play All');
}
async function backgroundObservation(mode) {
  assert.ok(primaryPage && !primaryPage.isClosed(), 'background acceptance needs the exact primary CDP target to undo Playwright focus emulation; never silently accept an automation-woken primary');
  // The existing Playwright owner session enabled focus emulation. A new sibling
  // CDP session cannot disable another session's visibility/capture override.
  // This runtime-checked private access is QA-only; fail closed on SDK drift.
  const pageImplementation = primaryPage._connection?.toImpl?.(primaryPage);
  const cdp = pageImplementation?.delegate?._mainFrameSession?._client;
  assert.equal(typeof cdp?.send, 'function', 'Installed Playwright must expose the original exact primary driver session for trustworthy background acceptance');
  await bounded(cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false }), 'undo ORIGINAL automation owner focus override');
  await pause(); await seek(0.8); await play(); await settledSource(`before-${mode}`, 'A');
  const before = await primary(() => window.__wmusicPlaybackQa.sample());
  const start = await instance.evaluate(({ BrowserWindow }, { primaryId, primaryUrl, overlayUrl, mode }) => {
    const main = BrowserWindow.fromId(primaryId), lyric = BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === overlayUrl);
    if (main.webContents.getURL() !== primaryUrl || !lyric?.isVisible()) throw new Error('Exact visible overlay required before background observation');
    if (mode === 'hidden') main.hide(); else main.minimize();
    return { mode, primaryVisible: main.isVisible(), primaryMinimized: main.isMinimized(), overlayVisible: lyric.isVisible(),
      backgroundThrottling: main.webContents.getBackgroundThrottling(), configuredBackgroundThrottling: main.webContents.getLastWebPreferences().backgroundThrottling ?? 'default', startedAtMs: Date.now() };
  }, { primaryId, primaryUrl, overlayUrl, mode });
  const observation = { ...start, before, frames: [], automationFocusOverrideDisabled: true, automationFocusOverrideOwner: 'original exact primary Playwright driver session, not a sibling CDP session', method: 'NO primary executeJavaScript, focus, synthetic ticks, clock injection or throttling changes during interval' }; report.background.push(observation);
  try {
    assert.equal(start.backgroundThrottling, true, 'effective native background throttling must remain enabled; never certify altered production scheduling');
    assert.notEqual(start.configuredBackgroundThrottling, false, 'configured background throttling must not disable production scheduling');
    if (mode === 'hidden') assert.equal(start.primaryVisible, false, 'hidden observation must actually hide primary');
    else assert.equal(start.primaryMinimized, true, 'minimized observation must actually minimize primary');
    // Read only the visible overlay/native mirror. Querying primary JS here can wake its timers and hide throttling.
    for (let index = 0; index < 12; index++) { await sleep(650); observation.frames.push(await sourceFrame(`${mode}-${index}`, false)); }
    observation.after = await primary(() => window.__wmusicPlaybackQa.sample());
    observation.finishedAtMs = Date.now();
    const frames = observation.frames, anchors = frames.map(frame => frame.native.snapshot.anchor);
    assert.ok(anchors.every(Boolean), 'hidden/minimized source anchors must remain present');
    observation.anchorAgesMs = frames.map((frame, index) => frame.observedAtMs - anchors[index].receivedAtMs);
    observation.renderedSourceLines = [...new Set(frames.map(frame => frame.dom.current))];
    assert.equal(before.audio[0].muted, false, 'background progression uses unchanged native Audio mute state and physically silent zero-PCM WAV, NOT the separately failed force-muted variant');
    assert.ok(observation.after.audio[0].currentTime > before.audio[0].currentTime + 6, 'native zero-PCM Audio must really advance in background');
    assert.equal(observation.after.audio[0].source, 'A'); assert.equal(observation.after.audioConstructions, 1);
    assert.equal(observation.after.visibility, 'hidden', 'real native hidden/minimized primary must not be made visible by automation');
    assert.equal(observation.after.focused, false, 'automation must not fake primary focus during background acceptance');
    assert.ok(new Set(anchors.map(anchor => anchor.receivedAtMs)).size >= 6, 'automatic publisher must keep supplying fresh native source samples');
    assert.ok(observation.anchorAgesMs.every(age => age >= 0 && age < 1500), 'Chromium throttled automatic publication beyond 1.5s; retain this real failure, do not change production flags');
    assert.ok(frames.every(frame => frame.dom.stale === 'false'), 'visible overlay became stale while primary was hidden/minimized');
    assert.ok(observation.renderedSourceLines.length >= 2, 'visible overlay must really progress across supplied source lines');
    for (const frame of frames) {
      assertSourceFrame(frame, 'A');
      const anchor = frame.native.snapshot.anchor;
      const expectedNativeMs = before.audio[0].currentTime * 1000 + (anchor.receivedAtMs - before.sampledAtMs) * before.audio[0].rate;
      assert.ok(Math.abs(anchor.positionMs - expectedNativeMs) < 650, 'background native anchor must track the real advancing Audio, not a synthetic/cached React clock');
      assert.ok(sourceFixture('A').lyrics.lines.some(line => line.text === frame.dom.current), 'background DOM words must be source-only');
    }
    await screenshot(`overlay-primary-${mode}`, overlayUrl);
    return observation;
  } finally {
    await instance.evaluate(({ BrowserWindow }, id) => { const window = BrowserWindow.fromId(id); if (window.isMinimized()) window.restore(); window.show(); }, primaryId);
    // Do not detach the SDK-owned session: it still drives the later real UI cases.
    await sleep(250);
  }
}
function controlGeometry() {
  const specs = [
    ['lyrics', '.desktop-playerbar .desktop-lyrics-toggle', 'button'], ['queue', '.desktop-playerbar button[aria-label="播放队列"]', 'button'],
    ['mute', '.desktop-playerbar .pad-volume-control button', 'button'], ['volume', '.desktop-playerbar .pad-volume-control input[aria-label="音量"]', 'slider'],
    ['next', '.desktop-playerbar button[aria-label="下一首"]', 'button'], ['mode', '.desktop-playerbar .pad-mode-trigger', 'button'],
  ];
  const controls = specs.map(([name, selector, kind]) => {
    const element = document.querySelector(selector); if (!element) return { name, kind, missing: true };
    const rect = element.getBoundingClientRect(); let visible = rect.width > 0 && rect.height > 0, clipped = false;
    for (let node = element; node; node = node.parentElement) {
      const css = getComputedStyle(node), bounds = node.getBoundingClientRect();
      if (css.display === 'none' || ['hidden', 'collapse'].includes(css.visibility) || Number(css.opacity) === 0 || node.inert || node.getAttribute('aria-hidden') === 'true') visible = false;
      if (node !== element && /(hidden|clip|scroll|auto)/.test(css.overflowX) && (rect.left < bounds.left - 0.5 || rect.right > bounds.right + 0.5)) clipped = true;
      if (node !== element && /(hidden|clip|scroll|auto)/.test(css.overflowY) && (rect.top < bounds.top - 0.5 || rect.bottom > bounds.bottom + 0.5)) clipped = true;
    }
    const centerX = rect.x + rect.width / 2, centerY = rect.y + rect.height / 2, hit = document.elementFromPoint(centerX, centerY);
    return { name, kind, selector, x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom,
      visible, clipped, inViewport: rect.left >= -0.5 && rect.top >= -0.5 && rect.right <= innerWidth + 0.5 && rect.bottom <= innerHeight + 0.5,
      hit: hit === element || element.contains(hit), disabled: element.disabled === true };
  });
  const next = document.querySelector('.desktop-playerbar button[aria-label="下一首"]');
  return { viewport: [innerWidth, innerHeight], view: document.querySelector('.desktop-playerbar')?.getAttribute('data-player-view'), controls,
    modeNextSibling: next?.nextElementSibling?.classList.contains('pad-mode-picker') === true };
}

try {
  assert.equal(process.platform, 'win32', 'real Windows/Win32 required; no silent native skips');
  await Promise.all([mkdir(profile), mkdir(runtime), mkdir(evidence)]); assert.deepEqual(await readdir(profile), [], 'fresh empty contained profile required');
  for (const name of ['out/main/index.js', 'out/preload/index.cjs', 'out/preload/desktop-lyrics.cjs', 'out/renderer/index.html', 'out/renderer/desktop-lyrics.html']) await stat(join(repo, name));
  const literalMap = text => Object.fromEntries([...text.matchAll(/^\s*(\w+):\s*'([^']+)'/gm)].map(match => [match[1], match[2]]));
  const shared = await readFile(join(repo, 'src/shared/channels.ts'), 'utf8'), dedicated = await readFile(join(repo, 'src/shared/desktop-lyrics.ts'), 'utf8');
  channels = literalMap(shared); lyricChannels = literalMap(dedicated);
  const fixtureKeys = ['authStatus', 'authLogin', 'authLogout', 'authCancelLogin', 'updatesCheck', 'updatesDownload', 'updatesInstall', 'musicFavorites', 'musicFavoritesSummary', 'musicHistory', 'musicPlaylists',
    'musicFavoriteState', 'musicSetFavorite', 'musicLyrics', 'musicResolvePlayback', 'musicReportPlayback', 'musicCreatePlaylist', 'musicUpdatePlaylistDescription', 'musicDeletePlaylist', 'queueLoad', 'queueSave'];
  const preload = await readFile(join(repo, 'src/preload/index.ts'), 'utf8'), ipc = await readFile(join(repo, 'src/main/ipc.ts'), 'utf8');
  for (const key of fixtureKeys) { assert.equal(typeof channels[key], 'string', `literal ${key} missing`); assert.ok(preload.includes(`channels.${key}`) && ipc.includes(`channels.${key}`), `fixture ${key} not registered by actual main/preload source`); }
  assert.equal(typeof lyricChannels.publish, 'string');
  report.discoveredFixtures = Object.fromEntries(fixtureKeys.map(key => [key, channels[key]])); report.observedPublicationChannel = lyricChannels.publish;
  report.harnessSha256 = hash(await readFile(fileURLToPath(import.meta.url)));
  report.playwrightDriver = { version: JSON.parse(await readFile(join(repo, 'node_modules/playwright-core/package.json'), 'utf8')).version,
    coreBundleSha256: hash(await readFile(join(repo, 'node_modules/playwright-core/lib/coreBundle.js'))),
    backgroundOwnerLookup: 'runtime-checked primaryPage._connection.toImpl(primaryPage).delegate._mainFrameSession._client; private QA-only seam; drift fails closed' };
  report.discoverySources = { channels: hash(shared), desktopLyrics: hash(dedicated), preload: hash(preload), mainIpc: hash(ipc), sourceNotAssertedEqualToOldOut: true };
  report.outBefore = await inventory(join(repo, 'out')); report.outBeforeSha256 = hash(JSON.stringify(report.outBefore));
  await writeFile(join(evidence, 'out-before.json'), JSON.stringify(report.outBefore, null, 2) + '\n');
  const startup = join(evidence, 'startup.json'), lifecycle = join(evidence, 'lifecycle.jsonl'), bootstrap = join(runtime, 'contained-real-main.cjs');
  const code = `const { app, BrowserWindow, Menu, session, ipcMain, net } = require('electron'); const fs = require('node:fs'); const path = require('node:path');
const profile = ${JSON.stringify(profile)}, scratch = ${JSON.stringify(scratch)}, lifecycle = ${JSON.stringify(lifecycle)};
const log = value => fs.appendFileSync(lifecycle, JSON.stringify({ ...value, atMs: Date.now() }) + '\\n');
// Playwright's Electron loader can add these anti-throttling flags. Keeping them would
// turn the requested hidden/minimized observation into a false-positive certificate.
const automationRemoved = ['disable-background-timer-throttling','disable-backgrounding-occluded-windows','disable-renderer-backgrounding'].map(name => {
 const present = app.commandLine.hasSwitch(name); app.commandLine.removeSwitch(name); if (app.commandLine.hasSwitch(name)) throw new Error('Cannot restore native background scheduling'); return { name, wasPresent: present, nowPresent: false };
});
app.setPath('userData', profile); app.setPath('sessionData', profile); app.setPath('temp', scratch); app.setPath('logs', path.join(profile, 'logs')); app.setPath('crashDumps', path.join(profile, 'crashes'));
if (path.resolve(app.getPath('userData')) !== path.resolve(profile) || path.resolve(app.getPath('sessionData')) !== path.resolve(profile)) throw new Error('Containment failed BEFORE production import/store restore');
for (const key of ['TMP','TEMP','TMPDIR']) if (path.resolve(process.env[key]) !== path.resolve(scratch)) throw new Error('Child scratch containment failed');
fs.writeFileSync(${JSON.stringify(startup)}, JSON.stringify({ pid: process.pid, userData: app.getPath('userData'), sessionData: app.getPath('sessionData'), temp: app.getPath('temp'), beforeProductionImport: true, automationRemoved, versions: process.versions }));
const qa = globalThis.__wmusicPlaybackMain = { networkBlocked: { chromium: 0, node: 0, electron: 0, undici: 0 }, publications: [], publicationCount: 0, menus: [], runtimeErrors: [] };
const oldMenu = Menu.buildFromTemplate.bind(Menu); Menu.buildFromTemplate = (...args) => { const menu = oldMenu(...args); qa.menus.push(menu); return menu; };
const handle = ipcMain.handle.bind(ipcMain); ipcMain.handle = (channel, listener) => handle(channel, channel === ${JSON.stringify(lyricChannels.publish)} ? async (event, value) => {
 const result = await listener(event, value); qa.publicationCount++;
 qa.publications.push({ atMs: Date.now(), accepted: result?.ok === true, errorCode: result?.error?.code || null, epoch: value?.epoch, generation: value?.generation, sequence: value?.sequence,
  track: value?.track ? { key: value.track.key, title: value.track.title, artist: value.track.artist } : null,
  clock: value?.clock ? { positionMs: value.clock.positionMs, playing: value.clock.playing, rate: value.clock.rate } : null,
  currentText: value?.current?.text ?? null, nextText: value?.next?.text ?? null, wireKeys: Object.keys(value || {}).sort() });
 if (qa.publications.length > 240) qa.publications.shift(); return result;
} : listener);
const offline = kind => { qa.networkBlocked[kind]++; throw new Error('Contained offline acceptance blocks HTTP(S); no remote request permitted'); };
globalThis.fetch = async () => offline('node');
for (const name of ['node:http','node:https']) { const module = require(name); module.request = module.get = () => offline('node'); }
net.fetch = async () => offline('electron'); net.request = () => offline('electron');
// Production explicitly imports undici.fetch; patching global fetch alone does NOT contain it.
const repoRequire = require('node:module').createRequire(${JSON.stringify(join(repo, 'package.json'))});
const undici = repoRequire('undici'), offlineAgent = new undici.MockAgent(); offlineAgent.disableNetConnect();
const dispatch = offlineAgent.dispatch.bind(offlineAgent);
offlineAgent.dispatch = (...args) => { qa.networkBlocked.undici++; return dispatch(...args); }; undici.setGlobalDispatcher(offlineAgent);
qa.offlineDispatcherActive = () => undici.getGlobalDispatcher() === offlineAgent;
qa.offlineUndiciProbe = async scheme => { try { await undici.fetch(scheme + '://wmusic-playback-containment.invalid/blocked'); return false; } catch { return true; } };
const protectedSessions = new WeakSet();
function protect(s) { if (protectedSessions.has(s)) return; protectedSessions.add(s); const request = s.webRequest, before = request.onBeforeRequest.bind(request);
 request.onBeforeRequest = (...args) => { const callback = args.at(-1); return before({ urls: ['<all_urls>'] }, (details, done) => {
  if (/^(https?|wss?):/i.test(details.url)) { qa.networkBlocked.chromium++; return done({ cancel: true }); }
  if (typeof callback === 'function') return callback(details, done); done({ cancel: false });
 }); }; request.onBeforeRequest({ urls: ['<all_urls>'] }, (_details, done) => done({ cancel: false })); }
app.on('session-created', protect);
app.commandLine.appendSwitch('disable-background-networking');
app.on('browser-window-created', (_event, window) => { const h = window.getNativeWindowHandle(); const hwnd = h.length >= 8 ? h.readBigUInt64LE().toString() : h.readUInt32LE().toString();
 log({ event: 'window-created', id: window.id, hwnd });
 window.webContents.on('did-finish-load', () => log({ event: 'document-loaded', id: window.id, url: window.webContents.getURL() }));
 window.webContents.on('preload-error', (_event, _path, error) => { qa.runtimeErrors.push({ event: 'preload-error', message: String(error.message) }); log({ event: 'preload-error', id: window.id, message: String(error.message) }); });
 window.on('closed', () => log({ event: 'window-closed', id: window.id, hwnd }));
});
app.on('before-quit', () => log({ event: 'before-quit' })); app.on('will-quit', () => log({ event: 'will-quit', remainingWindows: BrowserWindow.getAllWindows().length, networkBlocked: qa.networkBlocked }));
app.on('quit', (_event, code) => log({ event: 'quit', code }));
(async () => { await app.whenReady(); protect(session.defaultSession); await import(${JSON.stringify(pathToFileURL(join(repo, 'out/main/index.js')).href)}); })().catch(error => { log({ event: 'bootstrap-error', message: String(error.stack || error) }); console.error(error); app.exit(1); });`;
  report.bootstrapSha256 = hash(code); report.lifecycle = lifecycle; report.startupPath = startup;
  await writeFile(bootstrap, code);
  instance = await _electron.launch({ executablePath: electron, args: [bootstrap], cwd: repo, env, timeout: 30000 }); child = instance.process(); pidRecord.pids.push(child.pid);
  report.processOutput = { stdout: [], stderr: [] };
  for (const stream of ['stdout', 'stderr']) child[stream]?.on('data', bytes => { report.processOutput[stream].push(scrub(bytes.toString())); if (report.processOutput[stream].length > 200) report.processOutput[stream].shift(); });
  const attach = page => { page.on('pageerror', error => report.rendererErrors.push({ url: page.url(), message: scrub(error.message) })); page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({ url: page.url(), message: scrub(message.text()) }); }); };
  instance.on('window', attach); for (const page of await instance.windows()) attach(page);
  const containment = JSON.parse(await readFile(startup, 'utf8')); pidRecord.pids.push(containment.pid); report.startup = containment;
  assert.equal(containment.pid, await instance.evaluate(() => process.pid)); assert.equal(containment.beforeProductionImport, true);
  for (const key of ['userData', 'sessionData']) assert.equal(resolve(containment[key]), profile);
  assert.equal(resolve(containment.temp), scratch); assert.equal(resolve(await instance.evaluate(({ app }) => app.getPath('userData'))), profile);
  primaryId = await eventually(() => instance.evaluate(({ BrowserWindow }, url) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === url)?.id, primaryUrl), Number.isInteger, 'real exact primary document');
  primaryPage = (await instance.windows()).find(page => page.url() === primaryUrl);
  report.primaryDrive = primaryPage ? 'exact primary Playwright keyboard + real DOM button actions' : 'exact native primary executeJavaScript + native keyboard fallback; no generic production bridge';
  // Do not run media instrumentation in blank/failed network-containment documents.
  // Only the exact real primary/overlay documents are acceptance observation targets.
  await instance.context().addInitScript({ content: `if (${JSON.stringify([primaryUrl, overlayUrl])}.includes(location.href)) (${observeMedia.toString()})();` });
  await eventually(() => primary(() => typeof window.desktop?.desktopLyrics?.state === 'function'), Boolean, 'actual primary preload');
  await instance.evaluate(installBusinessFixtures, { channels, primaryId, primaryUrl, fixtures });
  const fixtureDocument = await reloadPrimary(); await rememberNative();

  if (epochDiagnostic) {
    await run(0, async () => {
      await click(`${bar} button[aria-label="显示桌面歌词"]`);
      await eventually(primaryState, value => value.shown, 'diagnostic real overlay shown');
      await startFromFavorites();
      await settledSource('reload-diagnostic-old-source-playing', 'A');
      const before = await state();
      await instance.evaluate(({ BrowserWindow }, { primaryId, primaryUrl }) => {
        const qa = globalThis.__wmusicPlaybackMain;
        qa.navigationObservations = [];
        BrowserWindow.fromId(primaryId).webContents.on('did-start-navigation', (...args) => {
          const details = args[0];
          qa.navigationObservations.push({ argumentCount: args.length, eventKeys: Object.keys(details || {}),
            exactPrimaryUrl: details?.url === primaryUrl, detailsMainFrame: details?.isMainFrame,
            detailsSameDocument: details?.isSameDocument, legacyUrlType: typeof args[1],
            legacyInPlace: args[2], legacyMainFrame: args[3] });
        });
      }, { primaryId, primaryUrl });
      await reloadPrimary();
      const firstAfter = await state();
      report.epochDiagnostic = { beforeEpoch: before.snapshot.epoch, beforeGeneration: before.snapshot.generation, firstAfterEpoch: firstAfter.snapshot.epoch,
        firstAfterGeneration: firstAfter.snapshot.generation,
        navigation: await instance.evaluate(() => globalThis.__wmusicPlaybackMain.navigationObservations) };
      const after = await eventually(state, value => value.snapshot.epoch > before.snapshot.epoch
        && ['track', 'anchor', 'current', 'next'].every(key => value.snapshot[key] === null),
      'new primary document must be able to clear old source despite the OLD publisher recovering the navigation-start epoch');
      report.epochDiagnostic.afterEpoch = after.snapshot.epoch;
      report.epochDiagnostic.afterGeneration = after.snapshot.generation;
      await primary(() => { window.desktop.app.quit().catch(() => {}); return true; });
      await eventually(() => Promise.resolve(child.exitCode !== null || child.signalCode !== null), Boolean, 'diagnostic native quit', 7500);
      assert.equal(child.exitCode, 0); pidRecord.exitedNaturally = true;
      return report.epochDiagnostic;
    });
  } else {
  await run(0, async () => {
    const boundary = await primary(() => ({ node: typeof process, require: typeof require, invoke: typeof window.desktop.invoke, overlayBridge: typeof window.desktopLyrics, lyrics: Object.keys(window.desktop.desktopLyrics).sort() }));
    assert.deepEqual(boundary, { node: 'undefined', require: 'undefined', invoke: 'undefined', overlayBridge: 'undefined', lyrics: ['onState', 'publish', 'state', 'updatePreferences'] });
    const media = await primary(() => window.__wmusicPlaybackQa.sample()); assert.equal(media.document, fixtureDocument); assert.equal(media.audioConstructions, 1); assert.equal(media.audio[0].native, true); assert.equal(media.audio[0].source, 'empty');
    const initial = await primaryState(); assert.equal(initial.shown, false); assert.equal(initial.snapshot.track, null); assert.equal(initial.snapshot.anchor, null);
    report.frames.push({ name: 'contained-initial-empty-source', observedAtMs: Date.now(), native: initial, media });
    const networkContainment = await instance.evaluate(async ({ BrowserWindow }) => {
      const qa = globalThis.__wmusicPlaybackMain, before = { ...qa.networkBlocked }, rejected = {};
      // session.fetch delegates to patched electron.net.fetch in this Electron version;
      // use a disposable hidden NO-preload window to exercise Chromium's actual request path.
      // It proves containment only, never application/Audio/overlay behavior.
      const probe = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
      try {
        for (const scheme of ['http', 'https']) {
          rejected[`undici-${scheme}`] = await qa.offlineUndiciProbe(scheme);
          try { await probe.loadURL(`${scheme}://wmusic-playback-containment.invalid/blocked`); rejected[`chromium-${scheme}`] = false; }
          catch (error) { rejected[`chromium-${scheme}`] = String(error).includes('ERR_BLOCKED_BY_CLIENT'); }
        }
      } finally { probe.destroy(); }
      return { before, after: { ...qa.networkBlocked }, rejected, offlineDispatcherActive: qa.offlineDispatcherActive(), selfTestDestination: 'reserved synthetic .invalid only; no service/account/media URL' };
    });
    assert.equal(networkContainment.offlineDispatcherActive, true); assert.ok(Object.values(networkContainment.rejected).every(Boolean));
    assert.equal(networkContainment.after.chromium - networkContainment.before.chromium, 2, 'both Chromium HTTP and HTTPS must be canceled before network');
    assert.equal(networkContainment.after.undici - networkContainment.before.undici, 2, 'both explicitly imported undici HTTP and HTTPS must hit disabled-network dispatcher');
    await screenshot('contained-primary-before-lyrics', primaryUrl);
    return { boundary, media, networkContainment, freshProfileAssertedBeforeImport: true, fixtureDocument, nativeState: initial };
  });
  await run(1, async () => {
    const controls = await eventually(() => primary(() => ({ labels: [...document.querySelectorAll('.desktop-playerbar button, .desktop-playerbar summary')].map(element => element.getAttribute('aria-label') || element.textContent.trim()), count: document.querySelectorAll('.desktop-playerbar button[aria-label="显示桌面歌词"]').length })),
      value => value.count === 1, 'MISSING INTEGRATION: actual playerbar must expose 显示桌面歌词; no direct IPC/tray substitute', 6000);
    await click(`${bar} button[aria-label="显示桌面歌词"]`);
    await eventually(async () => { try { return await state(); } catch { return null; } }, value => value?.shown && value.preferences.visible, 'actual control opens real overlay');
    await eventually(() => overlay(() => !!document.querySelector('.dl-lines')), Boolean, 'real overlay paint');
    const boundary = await overlay(() => ({ node: typeof process, require: typeof require, desktop: typeof window.desktop, api: Object.keys(window.desktopLyrics).sort(), media: window.__wmusicPlaybackQa?.sample() }));
    assert.equal(boundary.node, 'undefined'); assert.equal(boundary.require, 'undefined'); assert.equal(boundary.desktop, 'undefined'); assert.deepEqual(boundary.api, ['hide', 'onState', 'state', 'updatePreferences']);
    assert.equal(boundary.media.audioConstructions, 0); assert.equal(boundary.media.createdMedia, 0); assert.equal(boundary.media.mediaElements, 0); assert.equal(boundary.media.playCalls, 0);
    const native = await instance.evaluate(({ BrowserWindow }, url) => { const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === url), p = window.webContents.getLastWebPreferences(), h = window.getNativeWindowHandle();
      return { id: window.id, hwnd: h.length >= 8 ? h.readBigUInt64LE().toString() : h.readUInt32LE().toString(), visible: window.isVisible(), topmost: window.isAlwaysOnTop(), sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, webSecurity: p.webSecurity, webviewTag: p.webviewTag }; }, overlayUrl);
    assert.equal(native.visible, true); assert.equal(native.topmost, true); assert.equal(native.sandbox, true); assert.equal(native.contextIsolation, true); assert.equal(native.nodeIntegration, false); assert.equal(native.webSecurity, true); assert.equal(native.webviewTag, false);
    native.win32 = python("import ctypes,json,sys; u=ctypes.WinDLL('user32',use_last_error=True); g=u.GetWindowLongPtrW; g.argtypes=[ctypes.c_void_p,ctypes.c_int]; g.restype=ctypes.c_ssize_t; s=g(ctypes.c_void_p(int(json.loads(sys.argv[1]))),-20); print(json.dumps({'topmost':bool(s&8),'clickThrough':bool(s&32)}))", native.hwnd);
    assert.equal(native.win32.topmost, true); assert.equal(native.win32.clickThrough, false);
    await click(`${bar} button[aria-label="隐藏桌面歌词"]`); await eventually(primaryState, value => !value.shown, 'actual primary button hides native overlay');
    await click(`${bar} button[aria-label="显示桌面歌词"]`); await eventually(state, value => value.shown, 'actual primary button reopens native overlay');
    await rememberNative(); await screenshot('native-overlay-empty', overlayUrl); return { controls, boundary, native };
  });
  await run(2, async () => {
    const nativeAudio = await startFromFavorites(); await settledSource('automatic-playing-A', 'A'); generationA = lastForeground.native.snapshot.generation;
    const before = nativeAudio.audio[0].currentTime; await sleep(400); const after = await primary(() => window.__wmusicPlaybackQa.sample()); assert.ok(after.audio[0].currentTime > before + 0.15, 'native Audio clock must really advance');
    const publications = await instance.evaluate(() => ({ count: globalThis.__wmusicPlaybackMain.publicationCount, last: globalThis.__wmusicPlaybackMain.publications.at(-1) }));
    assert.ok(publications.count > 0 && publications.last.accepted, 'AUTOMATIC real root publisher must call real dedicated handler; test never publishes');
    assert.equal(publications.last.track.title, sourceFixture('A').track.title); assert.equal(publications.last.generation, generationA);
    await screenshot('automatic-A-primary', primaryUrl); await screenshot('automatic-A-overlay', overlayUrl); return { nativeAudio, after, generation: generationA, automaticPublicationObservation: publications };
  });
  await run(3, async () => {
    await pause(); await seek(1.5); const at15 = await settledSource('paused-A-word-1', 'A', true); assert.equal(at15.dom.word, 1); assert.equal(at15.dom.translation, 'true');
    await sleep(700); const still = await settledSource('paused-A-still', 'A', true); assert.equal(still.dom.current, at15.dom.current); assert.equal(still.dom.word, at15.dom.word);
    await click('.dl-settings label', '译文', overlayUrl); await eventually(state, value => !value.preferences.showTranslation, 'actual translation checkbox off');
    const next = await settledSource('paused-A-source-next', 'A', true); assert.equal(next.dom.secondary, sourceFixture('A').lyrics.lines[1].text);
    await click('.dl-settings label', '逐词', overlayUrl); await eventually(state, value => !value.preferences.wordHighlight, 'actual word checkbox off');
    const noWords = await settledSource('paused-A-highlight-off', 'A', true); assert.equal(noWords.dom.word, -1);
    await click('.dl-settings label', '逐词', overlayUrl); await eventually(state, value => value.preferences.wordHighlight, 'actual word checkbox on');
    await seek(0.4); const back = await settledSource('paused-A-backward-first-mark', 'A', true); assert.equal(back.dom.word, 0);
    await seek(5.5); const second = await settledSource('paused-A-forward-source-line', 'A', true); assert.equal(second.dom.current, sourceFixture('A').lyrics.lines[1].text);
    await seek(8.4); const unmarked = await settledSource('paused-A-unmarked-source-line', 'A', true); assert.equal(unmarked.dom.wordCount, 0); assert.equal(unmarked.dom.word, -1);
    await seek(1.5); await click('.dl-settings label', '译文', overlayUrl); await eventually(state, value => value.preferences.showTranslation, 'actual translation checkbox on');
    const translated = await settledSource('paused-A-translation-restored', 'A', true); await screenshot('source-translation-word-marks', overlayUrl);
    return { pausedClockStableMs: 700, seekTargetsSeconds: [1.5, 0.4, 5.5, 8.4, 1.5], unmarkedSourceHasNoInventedSegments: true, translatedCurrent: translated.dom.current };
  });
  await run(4, async () => {
    await play(); await settledSource('before-held-next-A', 'A');
    const oldAudio = await primary(() => window.__wmusicPlaybackQa.sample()), oldGeneration = lastForeground.native.snapshot.generation;
    await instance.evaluate(() => { globalThis.__wmusicPlaybackMain.business.holdB = true; }); await click(`${bar} button[aria-label="下一首"]`);
    await eventually(() => primary(() => document.querySelector('.pad-mini-meta strong')?.textContent), value => value === sourceFixture('B').track.title, 'React current really advances to B during held resolve');
    await eventually(() => instance.evaluate(() => globalThis.__wmusicPlaybackMain.business.held?.source || null), value => value === 'B', 'test main holds actual B playback request');
    const held = [];
    try {
      for (let index = 0; index < 5; index++) {
        await sleep(320); const frame = await settledSource(`held-B-old-A-${index}`, 'A'); held.push(frame);
        assert.equal(frame.native.snapshot.generation, oldGeneration, 'pending request token must not masquerade as committed Audio generation');
        assert.equal(frame.audioAfter.assignments, oldAudio.assignments, 'no Audio.src commit before held B resolves');
        assert.equal(frame.audioAfter.audio[0].paused, false);
        assert.ok(!`${frame.dom.current} ${frame.dom.secondary} ${frame.dom.title}`.includes('乙源'), 'B words must never be attached to old A Audio');
      }
      assert.ok(held.at(-1).audioAfter.audio[0].currentTime > oldAudio.audio[0].currentTime + 1, 'old native Audio intentionally continues playing while new React current waits');
      await screenshot('held-B-primary-selection', primaryUrl); await screenshot('held-B-overlay-still-A', overlayUrl);
    } finally { await instance.evaluate(() => globalThis.__wmusicPlaybackMain.business.held?.resolve()); }
    const loadedB = await eventually(() => primary(() => window.__wmusicPlaybackQa.sample()), value => value.audio[0].source === 'B' && !value.audio[0].paused && value.audio[0].readyState >= 3
      && value.assignments > oldAudio.assignments && value.trustedEvents.playing > oldAudio.trustedEvents.playing && value.trustedEvents.loadedmetadata > oldAudio.trustedEvents.loadedmetadata, 'B commits src and emits its own trusted native metadata/playing');
    await settledSource('committed-B', 'B'); generationB = lastForeground.native.snapshot.generation; assert.ok(generationB > oldGeneration);
    await pause(); await seek(1.5); const switched = await settledSource('committed-B-source-words', 'B', true); assert.equal(switched.dom.current, sourceFixture('B').lyrics.lines[0].text);
    await screenshot('committed-B-overlay', overlayUrl); return { heldFrames: held.length, oldGeneration, committedGeneration: generationB, nativeB: loadedB, sourceAssignmentDelta: loadedB.assignments - oldAudio.assignments };
  });
  await run(5, async () => {
    await play(); const before = await primary(() => window.__wmusicPlaybackQa.sample()); await press(seekSelector, 'End');
    const after = await eventually(() => primary(() => window.__wmusicPlaybackQa.sample()), value => value.trustedEvents.ended > (before.trustedEvents.ended || 0) && value.audio[0].source === 'A'
      && !value.audio[0].paused && value.trustedEvents.playing > before.trustedEvents.playing, 'real native ended advances list to A; no synthetic event/Next invocation');
    await settledSource('native-ended-wrap-A', 'A'); generationA = lastForeground.native.snapshot.generation;
    assert.ok(generationA > generationB); return { before, after, generation: generationA, transitionMethod: 'actual range End -> trusted native ended -> production automatic next' };
  });
  await run(6, async () => {
    await backgroundObservation('hidden'); await backgroundObservation('minimized'); return { observations: report.background.map(value => ({ mode: value.mode, frames: value.frames.length, anchorAgesMs: value.anchorAgesMs, renderedSourceLines: value.renderedSourceLines })), productionThrottlingUnmodified: report.background.length === 2 && report.background.every(value => value.backgroundThrottling === true && value.configuredBackgroundThrottling !== false) };
  });
  await run(7, async () => {
    await pause(); await click(`${bar} button[aria-label="收起播放页"]`);
    const problems = [];
    for (const [width, height] of [[960, 640], [1320, 840]]) {
      await instance.evaluate(({ BrowserWindow }, { id, width, height }) => BrowserWindow.fromId(id).setContentSize(width, height), { id: primaryId, width, height });
      for (const view of ['mini', 'full']) {
        if (view === 'full') await click(`${bar} button[aria-label="打开播放页"]`);
        await sleep(400); const geometry = await primary(controlGeometry); report.geometry.push({ requested: [width, height], ...geometry });
        await screenshot(`controls-${width}x${height}-${view}`, primaryUrl);
        if (JSON.stringify(geometry.viewport) !== JSON.stringify([width, height])) problems.push(`${width}x${height} actual viewport ${geometry.viewport}`);
        for (const control of geometry.controls) {
          if (control.missing || !control.visible || control.clipped || !control.inViewport || !control.hit) problems.push(`${width}x${height}/${view}/${control.name} missing/hidden/clipped/obscured: ${JSON.stringify(control)}`);
          if (control.kind === 'button' && (control.width < 44 || control.height < 44)) problems.push(`${width}x${height}/${view}/${control.name} shrunk below REQUIRED 44px hit target: ${control.width}x${control.height}`);
          if (control.kind === 'slider' && !(control.width >= 50 && control.height > 0)) problems.push(`${width}x${height}/${view}/volume must remain a separate usable slider`);
        }
        const volume = geometry.controls.find(control => control.name === 'volume'), mute = geometry.controls.find(control => control.name === 'mute'), next = geometry.controls.find(control => control.name === 'next'), mode = geometry.controls.find(control => control.name === 'mode');
        if (!(volume?.x >= mute?.right)) problems.push(`${width}x${height}/${view} mute and volume overlap`);
        if (!(geometry.modeNextSibling && mode?.x >= next?.right && mode.x - next.right < 20)) problems.push(`${width}x${height}/${view} Next/mode not adjacent distinct controls`);
        if (view === 'full') await click(`${bar} button[aria-label="收起播放页"]`);
      }
    }
    // Exercise independent volume/mute against the same real Audio; every PCM sample is zero, so no forced constructor mute is needed.
    await press(`${bar} input[aria-label="音量"]`, 'Home'); await eventually(() => primary(() => window.__wmusicPlaybackQa.sample()), value => value.audio[0].volume === 0, 'actual volume slider reaches native Audio');
    await click(`${bar} button[aria-label="取消静音"]`); await eventually(() => primary(() => window.__wmusicPlaybackQa.sample()), value => value.audio[0].volume > 0, 'actual mute control restores native Audio volume');
    assert.deepEqual(problems, [], 'real clipped/shrunk controls are product failures: do NOT shrink acceptance constants to make them pass'); return { frames: report.geometry.length, requiredButtonHitTarget: 44, problems };
  });
  await run(8, async () => {
    await click(`${bar} button[aria-label="播放队列"]`); await eventually(() => primary(() => !!document.querySelector('.queue-panel.is-open')), Boolean, 'actual queue drawer');
    const clear = await primary(() => {
      const queue = document.querySelector('.queue-panel'), buttons = [...queue.querySelectorAll('button')];
      const full = buttons.find(button => ['清空队列', '清空播放队列', '移除全部', '清空全部'].includes(button.textContent.trim()) || ['清空队列', '清空播放队列'].includes(button.getAttribute('aria-label')));
      const rows = [...queue.querySelectorAll('.queue-row')];
      return { full: full ? { text: full.textContent.trim(), label: full.getAttribute('aria-label') } : null,
        rows: rows.length, removableRows: rows.filter(row => !!row.querySelector('button[aria-label="从队列移除"]')).length,
        labels: buttons.map(button => button.getAttribute('aria-label') || button.textContent.trim()) };
    });
    // 清空待播 is NOT clear-all. Never replace this missing user capability with player.removeAt or a fake clear publication.
    assert.ok(clear.full || (clear.rows > 0 && clear.removableRows === clear.rows), `Actual queue UI cannot empty current/played rows; 清空待播 alone does not satisfy native-clear acceptance: ${JSON.stringify(clear)}`);
    if (clear.full) {
      if (clear.full.label) await click(`.queue-panel button[aria-label=${JSON.stringify(clear.full.label)}]`);
      else await click('.queue-panel button', clear.full.text);
    } else {
      let remaining = clear.rows;
      while (remaining > 0) {
        await primary(() => {
          const row = [...document.querySelectorAll('.queue-panel .queue-row')].at(-1), button = row?.querySelector('button[aria-label="从队列移除"]');
          if (!button || button.disabled) throw new Error('Actual final queue row has no working remove control'); button.click();
        });
        report.actions.push({ selector: '.queue-panel final actual row remove button', method: 'real DOM control .click(), not player.removeAt or a lyric DTO' });
        const count = await eventually(() => primary(() => document.querySelectorAll('.queue-panel .queue-row').length), count => count < remaining, 'actual queue row removal must make bounded progress');
        remaining = count;
      }
    }
    const empty = await eventually(state, value => ['track', 'anchor', 'current', 'next'].every(key => value.snapshot[key] === null), 'AUTOMATIC native clear after actual queue removal');
    const media = await eventually(() => primary(() => window.__wmusicPlaybackQa.sample()), value => value.audioConstructions === 1 && value.audio[0].paused && value.audio[0].source === 'empty', 'native singleton Audio stopped/cleared');
    const emptySaveRequest = await eventually(() => instance.evaluate(() => {
      const saved = globalThis.__wmusicPlaybackMain.business.queue;
      return saved ? { count: saved.tracks?.length, index: saved.index, positionSeconds: saved.positionSeconds } : null;
    }), value => value?.count === 0 && value.index === -1 && value.positionSeconds === 0,
    'actual App sends the existing empty-queue save contract after its debounce; fixture observation, NOT disk persistence');
    await eventually(() => overlay(() => document.querySelector('.dl-current')?.textContent), value => value === '尚未播放', 'overlay contains no stale source words after clear');
    await screenshot('queue-empty-overlay-cleared', overlayUrl); await click('.queue-panel button[aria-label="关闭队列"]'); return { clearControl: clear, native: empty, media, emptySaveRequest };
  });
  await run(9, async () => {
    await startFromFavorites(); await settledSource('before-document-reload-A', 'A');
    const before = await primary(() => window.__wmusicPlaybackQa.sample()), nativeBefore = await state(); epochBeforeReload = nativeBefore.snapshot.epoch;
    const document = await reloadPrimary(); assert.notEqual(document, before.document, 'reload must really create a new document and fresh Blob URLs');
    const reset = await eventually(state, value => value.snapshot.epoch > epochBeforeReload && ['track', 'anchor', 'current', 'next'].every(key => value.snapshot[key] === null), 'new epoch resets stale native source/words/clock');
    await eventually(() => overlay(() => document.querySelector('.dl-current')?.textContent), value => value === '尚未播放', 'new primary document cannot leave old words');
    const resetAudio = await primary(() => window.__wmusicPlaybackQa.sample()); assert.equal(resetAudio.audioConstructions, 1); assert.equal(resetAudio.audio[0].source, 'empty'); assert.equal(resetAudio.audio[0].paused, true);
    await screenshot('reloaded-primary-empty-epoch-overlay', overlayUrl);
    const realAudio = await startFromFavorites(); const fresh = await settledSource('new-document-automatic-A', 'A');
    assert.equal(fresh.native.snapshot.epoch, reset.snapshot.epoch); assert.ok(fresh.native.snapshot.generation >= 0);
    return { epochBefore: epochBeforeReload, epochAfter: reset.snapshot.epoch, documentBefore: before.document, documentAfter: document, resetAudio, realAudio, freshGeneration: fresh.native.snapshot.generation };
  });
  await run(10, async () => {
    const boundary = await overlay(() => ({ node: typeof process, require: typeof require, desktop: typeof window.desktop, media: window.__wmusicPlaybackQa.sample() }));
    assert.equal(boundary.node, 'undefined'); assert.equal(boundary.require, 'undefined'); assert.equal(boundary.desktop, 'undefined');
    for (const key of ['audioConstructions', 'createdMedia', 'mediaElements', 'playCalls']) assert.equal(boundary.media[key], 0, 'overlay never owns Audio/media');
    const diagnostics = await instance.evaluate(() => { const qa = globalThis.__wmusicPlaybackMain; return { publicationCount: qa.publicationCount, publications: qa.publications, networkBlocked: qa.networkBlocked, runtimeErrors: qa.runtimeErrors, forbiddenBusinessCalls: qa.business.forbidden,
      businessCalls: qa.business.calls, menusCaptured: qa.menus.length }; }); report.nativeDiagnostics = diagnostics;
    assert.deepEqual(diagnostics.forbiddenBusinessCalls, []); assert.deepEqual(diagnostics.runtimeErrors, []); assert.deepEqual(report.rendererErrors, []);
    assert.ok(diagnostics.publicationCount > 0); assert.equal(report.manualLyricPublications, 0);
    const windows = await rememberNative(); assert.equal(windows.filter(window => window.url === overlayUrl && window.visible).length, 1);
    // Acceptance quit is the real narrow primary API; cleanup below is not counted as this assertion.
    await primary(() => { window.desktop.app.quit().catch(() => {}); return true; });
    await eventually(() => Promise.resolve(child.exitCode !== null || child.signalCode !== null), Boolean, 'actual application quit', 7500); assert.equal(child.exitCode, 0);
    const dead = await eventually(() => Promise.resolve(liveness()), value => !value.alivePids.length && !value.liveWindows.length, 'native process/owned window shutdown', 7500);
    const events = (await readFile(lifecycle, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.ok(events.some(event => event.event === 'will-quit' && event.remainingWindows === 0)); assert.ok(events.some(event => event.event === 'quit' && event.code === 0));
    for (const window of windows) assert.ok(events.some(event => event.event === 'window-closed' && event.id === window.id));
    pidRecord.exitedNaturally = true; return { boundary, exitCode: child.exitCode, dead, lifecycle };
  });
  }
  assert.equal(report.passed.length, labels.length);
} catch (error) {
  failure(error);
  if (instance) {
    try { report.failureAudio = await primary(() => window.__wmusicPlaybackQa?.sample() || null); } catch (error) { report.mainErrors.push(scrub(error)); }
    try { report.failureNativeState = await primaryState(); } catch (error) { report.mainErrors.push(scrub(error)); }
    for (const [name, url] of [['failure-primary', primaryUrl], ['failure-overlay', overlayUrl]]) {
      try { const exists = await instance.evaluate(({ BrowserWindow }, url) => BrowserWindow.getAllWindows().some(window => window.webContents.getURL() === url && window.isVisible() && !window.isMinimized()), url); if (exists) await screenshot(name, url); } catch (error) { report.mainErrors.push(scrub(error)); }
    }
  }
} finally {
  try { report.outAfter = await inventory(join(repo, 'out')); report.outAfterSha256 = hash(JSON.stringify(report.outAfter)); report.outUnchanged = JSON.stringify(report.outAfter) === JSON.stringify(report.outBefore);
    await mkdir(evidence, { recursive: true }); await writeFile(join(evidence, 'out-after.json'), JSON.stringify(report.outAfter, null, 2) + '\n'); assert.equal(report.outUnchanged, true, 'out-byte inventory drift invalidates result'); }
  catch (error) { failure(error); }
  if (instance) {
    try { await rememberNative(); report.finalDiagnostics = await instance.evaluate(() => { const qa = globalThis.__wmusicPlaybackMain; return { publications: qa.publications, publicationCount: qa.publicationCount, networkBlocked: qa.networkBlocked, runtimeErrors: qa.runtimeErrors, businessCalls: qa.business?.calls, forbiddenBusinessCalls: qa.business?.forbidden, menusCaptured: qa.menus.length }; }); }
    catch (error) { if (!pidRecord.exitedNaturally) report.mainErrors.push(scrub(error)); }
    if (child && child.exitCode === null && child.signalCode === null) await Promise.race([instance.close().catch(error => report.mainErrors.push(scrub(error))), sleep(5000)]);
  }
  try {
    // Recover exact owned PIDs/HWNDs even if launch failed before inspector attachment.
    if (report.startupPath) { const startup = JSON.parse(await readFile(report.startupPath, 'utf8')); pidRecord.pids.push(startup.pid); }
    if (report.lifecycle) { const events = (await readFile(report.lifecycle, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      for (const event of events.filter(event => event.event === 'window-created')) if (!pidRecord.windows.some(window => window.hwnd === event.hwnd)) pidRecord.windows.push({ id: event.id, hwnd: event.hwnd });
      report.lifecycleEvents = events; }
    pidRecord.pids = [...new Set(pidRecord.pids.filter(Number.isInteger))]; let live = liveness();
    if (live.alivePids.length) { pidRecord.forcedCleanup = true; for (const pid of live.alivePids) spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { env, encoding: 'utf8', timeout: 10000, windowsHide: true }); }
    pidRecord.cleanup = await eventually(() => Promise.resolve(liveness()), value => !value.alivePids.length && !value.liveWindows.length, 'unconditional owned process/HWND cleanup', 7500);
    report.processExited = !pidRecord.cleanup.alivePids.length && !pidRecord.cleanup.liveWindows.length;
  } catch (error) { failure(error); }
  for (const directory of [profile, runtime]) { try { await rm(directory, { recursive: true, force: true, maxRetries: 15, retryDelay: 200 }); } catch (error) { failure(error); } }
  try { const absent = path => stat(path).then(() => false, error => { if (error.code === 'ENOENT') return true; throw error; });
    report.profileRemoved = await absent(profile); report.runtimeRemoved = await absent(runtime); assert.ok(report.processExited && report.profileRemoved && report.runtimeRemoved, 'owned runtime/profile/process cleanup incomplete'); }
  catch (error) { failure(error); }
  report.processes = pidRecord; report.completedCases = report.passed.length; report.unexecutedCases = labels.filter(label => !report.steps.some(step => step.label === label));
  // Chromium reports this exact owned-primary meta-CSP warning at console error level.
  // Preserve raw records and never allow other documents, messages, CSP errors or main diagnostics.
  const knownConsoleWarning = diagnostic => diagnostic?.url === primaryUrl
    && diagnostic.message === "The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element.";
  report.consoleDiagnostics = {
    knownWarnings: report.consoleErrors.filter(knownConsoleWarning),
    unexpectedErrors: report.consoleErrors.filter(diagnostic => !knownConsoleWarning(diagnostic)),
  };
  report.accepted = report.completedCases === labels.length && !report.errors.length && !report.rendererErrors.length && !report.consoleDiagnostics.unexpectedErrors.length && !report.mainErrors.length && report.outUnchanged && report.processExited && report.profileRemoved && report.runtimeRemoved && pidRecord.exitedNaturally && !pidRecord.forcedCleanup;
  if (!report.accepted) process.exitCode = 1;
  report.finishedAt = new Date().toISOString(); await mkdir(evidence, { recursive: true }); await writeFile(join(evidence, 'evidence.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ mode: report.mode, accepted: report.accepted, completedCases: report.completedCases, requiredCases: labels.length, failedAssertion: report.steps.find(step => step.status === 'failed')?.error || report.errors[0],
    evidence: join(evidence, 'evidence.json'), outBeforeSha256: report.outBeforeSha256, outAfterSha256: report.outAfterSha256, outUnchanged: report.outUnchanged,
    processExited: report.processExited, profileRemoved: report.profileRemoved, runtimeRemoved: report.runtimeRemoved, unexecutedCases: report.unexecutedCases }));
}
