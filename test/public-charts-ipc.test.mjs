import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';

// Actual TS sources are transformed in memory, with Electron/storage replaced.
// No compiled app, real profile/account, native runtime or real service is represented here.
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
function host(t, { now } = {}) {
  const handlers = new Map(), cache = new Map();
  const frame = { url: pathToFileURL(resolve(root, 'src/renderer/index.html')).href };
  const window = { webContents: { mainFrame: frame } };
  const event = { sender: window.webContents, senderFrame: frame };
  const rendererWindow = {};
  const stubs = {
    electron: { ipcMain: { removeHandler: key => handlers.delete(key), handle: (key, fn) => handlers.set(key, fn) }, BrowserWindow: class {}, app: {}, dialog: {},
      contextBridge: { exposeInMainWorld: (name, value) => { rendererWindow[name] = value; } },
      ipcRenderer: { invoke: (channel, input) => handlers.get(channel)(event, input) } },
    './desktop-lyrics': { createDesktopLyricsPublisher: () => ({}) },
    './storage': { persistenceMode: () => 'memory-only', clearPersonalData: async () => {}, clearMusicSession: async () => {}, loadMusicSession: async () => null },
    './lyrics-fallback': {}, './lyrics-cache': {}, './system-fonts': {},
    './proxy.mjs': {}, '../auth.mjs': {}, '../login-callback.mjs': {},
    '../music.mjs': { MusicClient: class { constructor() { throw new Error('account transport forbidden in anonymous test'); } } },
  };
  if (now) {
    // Test-only constructor clock injection; all validations and adapter code remain real.
    const actual = require(resolve(root, 'src/public-charts.mjs'));
    stubs['../public-charts.mjs'] = { ...actual, createPublicCharts: options => actual.createPublicCharts({ ...options, now }) };
  }
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} }; cache.set(path, module);
    const code = transformSync(readFileSync(path, 'utf8'), { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
    const localRequire = spec => {
      if (Object.hasOwn(stubs, spec)) return stubs[spec];
      const target = spec.startsWith('.') ? resolve(dirname(path), spec) : spec;
      if (spec.startsWith('.') && !/\.[cm]?[jt]s$/.test(target)) return load(target + '.ts');
      return require(target);
    };
    runInNewContext(code, { module, exports: module.exports, require: localRequire, __dirname: dirname(path),
      AbortSignal, AbortController, URL, URLSearchParams, TextDecoder, Buffer, setTimeout, clearTimeout, console, window: rendererWindow });
    return module.exports;
  }
  const { AuthManager } = load(resolve(root, 'src/main/auth-manager.ts'));
  const { registerIpc } = load(resolve(root, 'src/main/ipc.ts'));
  const { channels } = load(resolve(root, 'src/shared/channels.ts'));
  const auth = new AuthManager(() => {});
  registerIpc(window, auth);
  const agent = new MockAgent(); agent.disableNetConnect();
  // Observe actual Undici dispatch lifetime, not UI busy flags or invocation counts.
  const traffic = { active: 0, peak: 0, paths: [] };
  const dispatch = agent.dispatch.bind(agent);
  agent.dispatch = (options, handler) => {
    traffic.paths.push(options.path); traffic.active++; traffic.peak = Math.max(traffic.peak, traffic.active);
    let finished = false;
    const finish = () => { if (!finished) { finished = true; traffic.active--; } };
    for (const name of ['onComplete', 'onError']) {
      const original = handler[name];
      handler[name] = (...args) => { finish(); return original.apply(handler, args); };
    }
    try { return dispatch(options, handler); } catch (error) { finish(); throw error; }
  };
  const previous = getGlobalDispatcher(); setGlobalDispatcher(agent);
  t.after(async () => { setGlobalDispatcher(previous); await agent.close(); });
  const json = value => JSON.parse(JSON.stringify(value));
  return { agent, traffic, auth, channels, event, window, rendererApi: () => {
    load(resolve(root, 'src/preload/index.ts'));
    return load(resolve(root, 'src/renderer/lib/api.ts')).api;
  }, invoke: async (key, input, sender = event) => {
    assert.equal(typeof handlers.get(key), 'function', `missing named IPC ${key}`);
    return json(await handlers.get(key)(sender, input));
  } };
}
const origin = 'https://portal-drcn.music.dbankcloud.cn';
const catalogPath = '/music-operation-service/v1/service/page/detail/all?pageType=9202&hasRecommend=0';
const catalog = { result: { resultCode: '000000' }, columnInfoExs: [{ columnInfo: { contentType: '7', contentName: '热门榜单' },
  contentSimpleInfos: [{ contentID: 'live-choice', contentName: '窄版热门榜', contentType: '7', totalCount: '299' }] }] };
const detail = { result: { resultCode: '000000' }, chartInfoEx: { chartInfo: { contentID: 'live-choice', contentName: '窄版热门榜', contentType: '7', totalCount: '200' },
  songSimpleInfos: [{ contentID: 'actual-track', contentName: '曲目甲', contentType: '1', artistID: ['artist-A'], artistName: '歌手甲' }] } };
function reply(agent, path, body) { agent.get(origin).intercept({ method: 'GET', path }).reply(200, body, { headers: { 'content-type': 'application/json' } }); }

test('16 identical concurrent actual detail IPC calls share one delayed upstream request', async t => {
  const h = host(t);
  reply(h.agent, catalogPath, catalog);
  assert.equal((await h.invoke(h.channels.musicCharts, {})).ok, true);
  let upstreamRequests = 0;
  h.agent.get(origin).intercept({ method: 'GET', path: '/music-operation-service/v1/service/chart/detail/bychartid?chartID=live-choice&start=0&limit=10' })
    .reply(200, () => { upstreamRequests++; return detail; }, { headers: { 'content-type': 'application/json' } }).delay(20).times(16);
  const results = await Promise.all(Array.from({ length: 16 }, () => h.invoke(h.channels.musicChartDetail, { id: 'live-choice' })));
  t.diagnostic(JSON.stringify({ identicalConcurrentInvocations: 16, upstreamRequests, successfulReplies: results.filter(item => item.ok).length }));
  assert.equal(upstreamRequests, 1, 'same in-flight metadata read must not fan out into 16 HTTP requests');
  assert.ok(results.every(item => item.ok && item.data.tracks[0].id === 'actual-track'));
});

test('16 concurrent catalog IPC reads including refresh share discovery without cancelling each other', async t => {
  const h = host(t);
  let upstreamRequests = 0;
  h.agent.get(origin).intercept({ method: 'GET', path: catalogPath })
    .reply(200, () => { upstreamRequests++; return catalog; }, { headers: { 'content-type': 'application/json' } }).delay(20).times(16);
  const results = await Promise.all(Array.from({ length: 16 }, (_, i) => h.invoke(h.channels.musicCharts, { refresh: i % 2 === 0 })));
  t.diagnostic(JSON.stringify({ concurrentCatalogInvocations: 16, upstreamRequests, successfulReplies: results.filter(item => item.ok).length }));
  assert.equal(upstreamRequests, 1, 'in-flight catalog reads must coalesce before generation invalidation');
  assert.ok(results.every(item => item.ok && item.data.charts[0].id === 'live-choice'));
  reply(h.agent, '/music-operation-service/v1/service/chart/detail/bychartid?chartID=live-choice&start=0&limit=10', detail);
  assert.equal((await h.invoke(h.channels.musicChartDetail, { id: 'live-choice' })).ok, true);
});

test('16 different detail IPC reads have an aggregate two-HTTP ceiling and reject excess without queueing', async t => {
  const h = host(t);
  reply(h.agent, catalogPath, catalog);
  assert.equal((await h.invoke(h.channels.musicCharts, {})).ok, true);
  h.traffic.peak = 0;
  for (let i = 0; i < 16; i++) {
    h.agent.get(origin).intercept({ method: 'GET', path: `/music-operation-service/v1/service/chart/detail/bychartid?chartID=live-choice&start=${i * 10}&limit=10` })
      .reply(200, detail, { headers: { 'content-type': 'application/json' } }).delay(20);
  }
  const results = await Promise.all(Array.from({ length: 16 }, (_, i) => h.invoke(h.channels.musicChartDetail, { id: 'live-choice', start: i * 10 })));
  const accepted = results.filter(item => item.ok).length, rejected = results.filter(item => !item.ok);
  t.diagnostic(JSON.stringify({ differentInvocations: 16, upstreamRequests: h.traffic.paths.length - 1, peakHttp: h.traffic.peak, accepted, rejected: rejected.length }));
  assert.equal(h.traffic.peak, 2, 'all new public reads must share a main-side HTTP in-flight limit');
  assert.equal(h.traffic.paths.length - 1, 2, 'no deferred background queue may drain the other 14 requests');
  assert.equal(accepted, 2); assert.equal(rejected.length, 14); assert.equal(h.traffic.active, 0);
  assert.ok(rejected.every(item => item.error.kind === 'network' && item.error.retryable && item.error.code === 'PUBLIC_CHART_BUSY'));
});

test('catalog refresh and actual logout cannot reset the shared time-window request budget', async t => {
  let at = 0;
  const h = host(t, { now: () => at });
  const readCatalog = async refresh => {
    reply(h.agent, catalogPath, catalog);
    assert.equal((await h.invoke(h.channels.musicCharts, { refresh })).ok, true);
  };
  await readCatalog(false); // 1: normal discovery
  reply(h.agent, '/music-operation-service/v1/service/chart/detail/bychartid?chartID=live-choice&start=0&limit=10', detail);
  assert.equal((await h.invoke(h.channels.musicChartDetail, { id: 'live-choice' })).ok, true); // 2
  await readCatalog(true); // 3: refresh is not a fresh budget
  assert.equal((await h.auth.logout()).ok, true);
  await readCatalog(false); // 4: real account transition did not replenish tokens
  const rate = result => {
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'PUBLIC_CHART_RATE_LIMIT');
    assert.equal(result.error.kind, 'network'); assert.equal(result.error.retryable, true);
  };
  rate(await h.invoke(h.channels.musicChartDetail, { id: 'live-choice', start: 10 }));
  assert.equal((await h.auth.logout()).ok, true);
  rate(await h.invoke(h.channels.musicCharts, { refresh: true }));
  at = 999;
  rate(await h.invoke(h.channels.musicCharts, {}));
  assert.equal(h.traffic.paths.length, 4, 'rejected reads are not scheduled or dispatched after logout');
  at = 1000;
  await readCatalog(false);
  rate(await h.invoke(h.channels.musicChartDetail, { id: 'live-choice' }));
  assert.equal(h.traffic.paths.length, 5);
  t.diagnostic(JSON.stringify({ simulatedMilliseconds: at, dispatches: h.traffic.paths.length, peakHttp: h.traffic.peak }));
});

test('an HTTP denial settles coalesced IPC readers, aborts the other active read and stays terminal', async t => {
  for (const status of [401, 403]) await t.test(String(status), async t => {
    const h = host(t, { now: () => 0 });
    reply(h.agent, catalogPath, catalog);
    assert.equal((await h.invoke(h.channels.musicCharts, {})).ok, true);
    h.agent.get(origin).intercept({ method: 'GET', path: '/music-operation-service/v1/service/chart/detail/bychartid?chartID=live-choice&start=0&limit=10' })
      .reply(status, {}, { headers: { 'content-type': 'application/json' } }).delay(10);
    h.agent.get(origin).intercept({ method: 'GET', path: '/music-operation-service/v1/service/chart/detail/bychartid?chartID=live-choice&start=10&limit=10' })
      .reply(200, detail, { headers: { 'content-type': 'application/json' } }).delay(30);
    const denied = Array.from({ length: 16 }, () => h.invoke(h.channels.musicChartDetail, { id: 'live-choice' }));
    const other = h.invoke(h.channels.musicChartDetail, { id: 'live-choice', start: 10 });
    const results = await Promise.all(denied);
    assert.ok(results.every(item => !item.ok && item.error.kind === 'permission' && !item.error.retryable && item.error.code === 'PUBLIC_CHART_DENIED'));
    assert.equal((await other).ok, false);
    for (let i = 0; i < 6; i++) {
      const result = await h.invoke(h.channels.musicCharts, { refresh: true });
      assert.equal(result.error.code, 'PUBLIC_CHART_DENIED'); assert.equal(result.error.retryable, false);
    }
    assert.equal(h.traffic.paths.length, 3); assert.equal(h.traffic.active, 0); assert.equal(h.traffic.peak, 2);
  });
});

test('actual renderer wrapper can manually read catalog then first screen then more within the default burst', async t => {
  const h = host(t, { now: () => 0 }), api = h.rendererApi();
  reply(h.agent, catalogPath, catalog);
  const found = await api.charts(false);
  const first = { ...detail, chartInfoEx: { ...detail.chartInfoEx,
    songSimpleInfos: Array.from({ length: 10 }, (_, i) => ({ ...detail.chartInfoEx.songSimpleInfos[0], contentID: `manual-${i}` })) } };
  reply(h.agent, '/music-operation-service/v1/service/chart/detail/bychartid?chartID=live-choice&start=0&limit=10', first);
  const screen = await api.chartDetail({ id: found.charts[0].id });
  assert.equal(screen.tracks.length, 10); assert.equal(screen.hasMore, true); assert.equal(screen.nextStart, 10);
  reply(h.agent, '/music-operation-service/v1/service/chart/detail/bychartid?chartID=live-choice&start=10&limit=10', detail);
  const more = await api.chartDetail({ id: found.charts[0].id, start: screen.nextStart, limit: 10 });
  assert.equal(more.tracks[0].id, 'actual-track'); assert.equal(more.hasMore, false);
  assert.equal(h.traffic.paths.length, 3); assert.equal(h.traffic.active, 0);
});

test('logout invalidates pending anonymous discovery before it can repopulate selectable IDs', async t => {
  const h = host(t);
  h.agent.get(origin).intercept({ method: 'GET', path: catalogPath }).reply(200, catalog, { headers: { 'content-type': 'application/json' } }).delay(30);
  const pending = h.invoke(h.channels.musicCharts, {});
  await h.auth.logout();
  const result = await pending;
  assert.equal(result.ok, false);
  const oldChoice = await h.invoke(h.channels.musicChartDetail, { id: 'live-choice' });
  assert.equal(oldChoice.ok, false);
  assert.equal(oldChoice.error.kind, 'invalid', 'late catalog cannot repopulate IDs after logout');
});

test('existing exact sender/top-frame/document guard protects both named capabilities', async t => {
  const h = host(t);
  for (const channel of [h.channels.musicCharts, h.channels.musicChartDetail]) {
    for (const sender of [{ ...h.event, sender: {} }, { ...h.event, senderFrame: { url: h.event.senderFrame.url } }]) {
      await assert.rejects(() => h.invoke(channel, {}, sender), /来源不受信任/);
    }
    for (const url of ['https://portal-drcn.music.dbankcloud.cn/', h.event.senderFrame.url + '?changed', 'file:///wrong/index.html']) {
      const previous = h.event.senderFrame.url; h.event.senderFrame.url = url;
      try { await assert.rejects(() => h.invoke(channel, {}, h.event), /来源不受信任/); }
      finally { h.event.senderFrame.url = previous; }
    }
  }
  for (const input of [null, [], { refresh: 'true' }, { url: 'https://evil.invalid/' }]) {
    assert.equal((await h.invoke(h.channels.musicCharts, input)).error.kind, 'invalid');
  }
  for (const input of [null, { id: ' live-choice' }, { id: 'live-choice', limit: 11 }, { id: 'live-choice', start: 10, refresh: true }]) {
    assert.equal((await h.invoke(h.channels.musicChartDetail, input)).error.kind, 'invalid');
  }
});

test('HTTP200 business/schema failures return an error DTO rather than fake empty catalog success', async t => {
  const h = host(t);
  reply(h.agent, catalogPath, { result: { resultCode: '999999', resultMessage: 'must-not-leak-provider-body' }, columnInfoExs: [] });
  const result = await h.invoke(h.channels.musicCharts, {});
  assert.equal(result.ok, false); assert.equal(result.error.kind, 'unsupported');
  assert.ok(!result.error.message.includes('must-not-leak'));
});

test('actual renderer wrapper/preload/named IPC/main chain browses anonymously and propagates invalid DTOs', async t => {
  const h = host(t), api = h.rendererApi();
  reply(h.agent, catalogPath, catalog);
  const found = await api.charts(false);
  assert.equal(found.charts[0].id, 'live-choice');
  reply(h.agent, '/music-operation-service/v1/service/chart/detail/bychartid?chartID=live-choice&start=0&limit=10', detail);
  const page = await api.chartDetail({ id: found.charts[0].id });
  assert.equal(page.tracks[0].title, '曲目甲');
  await assert.rejects(() => api.chartDetail({ id: 'not-from-catalog' }), /目录/);
});

test('anonymous named IPC traverses actual AuthManager/huawei/normalizer while playback stays auth-gated', async t => {
  const h = host(t);
  assert.equal(typeof h.channels.musicCharts, 'string', 'dedicated catalog IPC missing');
  assert.equal(typeof h.channels.musicChartDetail, 'string', 'dedicated detail IPC missing');
  reply(h.agent, catalogPath, catalog);
  const found = await h.invoke(h.channels.musicCharts, {});
  assert.equal(found.ok, true); assert.equal(found.data.charts[0].id, 'live-choice');
  reply(h.agent, '/music-operation-service/v1/service/chart/detail/bychartid?chartID=live-choice&start=0&limit=10', detail);
  const page = await h.invoke(h.channels.musicChartDetail, { id: found.data.charts[0].id });
  assert.equal(page.ok, true); assert.equal(page.data.playlist.count, 200); assert.equal(page.data.tracks[0].id, 'actual-track');
  const playback = await h.invoke(h.channels.musicResolvePlayback, { trackId: 'actual-track', quality: 'standard' });
  assert.equal(playback.ok, false); assert.equal(playback.error.kind, 'auth');
});
