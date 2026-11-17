import assert from 'node:assert/strict';
import test from 'node:test';
import { fetch, MockAgent } from 'undici';

const origin = 'https://portal-drcn.music.dbankcloud.cn';
const catalogPath = '/music-operation-service/v1/service/page/detail/all?pageType=9202&hasRecommend=0';
const chart = (id = 'discovered-A') => ({ contentID: id, contentName: '测试热门榜', contentType: '7', totalCount: '299' });
const catalogBody = (cards = [chart()]) => ({ result: { resultCode: '000000' }, columnInfoExs: [
  { columnInfo: { contentType: '7', contentName: '其他栏目' }, contentSimpleInfos: [chart('not-featured')] },
  { columnInfo: { contentType: '7', contentName: '热门榜单' }, contentSimpleInfos: cards },
] });
async function service(t, body) {
  const mod = await import('../src/public-charts.mjs').catch(() => ({}));
  assert.equal(typeof mod.createPublicCharts, 'function', 'missing fixed anonymous public chart adapter');
  const agent = new MockAgent(); agent.disableNetConnect();
  t.after(() => agent.close());
  const requests = [];
  const client = mod.createPublicCharts({ fetchImpl: (url, options) => {
    requests.push({ url: String(url), options });
    return fetch(url, { ...options, dispatcher: agent });
  } });
  if (body) agent.get(origin).intercept({ path: catalogPath, method: 'GET' }).reply(200, body, { headers: { 'content-type': 'application/json' } });
  return { client, agent, requests };
}

test('fixed anonymous catalog transport returns only discovered contentType7 featured metadata', async t => {
  const { client, requests } = await service(t, catalogBody([chart(), { ...chart('song'), contentType: '1' }]));
  const result = await client.catalog();
  assert.equal(requests[0].url, origin + catalogPath);
  assert.equal(requests[0].options.redirect, 'error');
  assert.equal(requests[0].options.credentials, 'omit');
  assert.ok(requests[0].options.signal instanceof AbortSignal);
  assert.deepEqual(requests[0].options.headers, { accept: 'application/json' });
  assert.equal(result.source, 'huawei-public-h5');
  assert.equal(result.scope, 'featured');
  assert.deepEqual(result.charts, [{ id: 'discovered-A', title: '测试热门榜', kind: 'chart', count: 299 }]);
  assert.ok(Number.isFinite(Date.parse(result.fetchedAt)));
});

test('streaming response is actually bounded even without Content-Length', async () => {
  const { createPublicCharts } = await import('../src/public-charts.mjs');
  let cancelled = false, chunks = 0;
  const client = createPublicCharts({ fetchImpl: async () => new Response(new ReadableStream({
    pull(controller) { if (++chunks > 12) controller.close(); else controller.enqueue(new Uint8Array(256 * 1024).fill(32)); },
    cancel() { cancelled = true; },
  }), { headers: { 'content-type': 'application/json' } }) });
  await assert.rejects(() => client.catalog(), /过大/);
  assert.equal(cancelled, true, 'oversize stream must be cancelled, not read into an unbounded JSON allocation');
});

test('strict input and metadata bounds reject rather than normalize unsafe or oversized values', async t => {
  const { client, requests } = await service(t, catalogBody());
  await client.catalog();
  for (const input of [null, [], { id: ' discovered-A' }, { id: 'https://evil.invalid' }, { id: 'discovered-A', start: -1 },
    { id: 'discovered-A', start: 1 }, { id: 'discovered-A', start: 500 }, { id: 'discovered-A', limit: 20 },
    { id: 'discovered-A', refresh: 'yes' }, { id: 'discovered-A', start: 10, refresh: true }, { id: 'discovered-A', url: 'https://evil.invalid' }]) {
    await assert.rejects(() => client.detail(input), /参数|目录/);
  }
  for (const input of [null, [], { refresh: 1 }, { refresh: true, origin: 'https://evil.invalid' }]) {
    await assert.rejects(() => client.catalog(input), /参数/);
  }
  assert.equal(requests.length, 1, 'invalid input must not cause outbound HTTP');
  const { createPublicCharts } = await import('../src/public-charts.mjs');
  for (const body of [catalogBody([chart('../escape')]), catalogBody([{ ...chart(), contentName: 'x'.repeat(301) }]),
    catalogBody(Array.from({ length: 33 }, (_, i) => chart(`id-${i}`))), { result: { resultCode: '000000' } }]) {
    const bounded = createPublicCharts({ fetchImpl: async () => Response.json(body) });
    await assert.rejects(() => bounded.catalog(), /响应/);
  }
});

test('catalog generations and explicit invalidation prevent late responses restoring selectable IDs', async () => {
  const { createPublicCharts } = await import('../src/public-charts.mjs');
  let release;
  const client = createPublicCharts({ fetchImpl: () => new Promise(resolve => { release = resolve; }) });
  const pending = client.catalog();
  assert.equal(typeof client.invalidate, 'function', 'main needs a public-read epoch invalidator');
  client.invalidate();
  release(Response.json(catalogBody()));
  await assert.rejects(() => pending, /已更改|取消/);
  await assert.rejects(() => client.detail({ id: 'discovered-A' }), /目录/);
  let count = 0;
  const current = createPublicCharts({ fetchImpl: async () => ++count === 1 ? Response.json(catalogBody()) : Response.json({}, { status: 503 }) });
  await current.catalog();
  await assert.rejects(() => current.catalog({ refresh: true }));
  await assert.rejects(() => current.detail({ id: 'discovered-A' }), /目录/);
});

test('401/403 stop anonymous reads without auth recovery or leaking provider bodies', async () => {
  const { createPublicCharts, PublicChartError } = await import('../src/public-charts.mjs');
  for (const status of [401, 403]) {
    let calls = 0;
    const client = createPublicCharts({ fetchImpl: async () => { calls++; return Response.json({ secret: 'must not leak' }, { status }); } });
    await assert.rejects(() => client.catalog(), error => error instanceof PublicChartError && error.kind === 'permission' && error.retryable === false && !error.message.includes('secret'));
    await assert.rejects(() => client.catalog({ refresh: true }), /拒绝/);
    assert.equal(calls, 1, 'denial never triggers retry, origin switch, cookie or authorization');
  }
});

test('401/403 latch before cleanup even when real errored response streams reject cancel', async t => {
  const { createPublicCharts, PublicChartError } = await import('../src/public-charts.mjs');
  const observed = [];
  for (const status of [401, 403]) {
    let calls = 0;
    const client = createPublicCharts({ fetchImpl: async () => {
      calls++;
      return new Response(new ReadableStream({
        start(controller) { controller.error(new Error('synthetic response stream failure')); },
      }), { status });
    } });
    const errors = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      try { await client.catalog(); assert.fail('denied request must reject'); }
      catch (error) { errors.push(error); }
    }
    observed.push({ status, outboundCalls: calls, expectedOutboundCalls: 1 });
    client.invalidate();
    await assert.rejects(() => client.catalog({ refresh: true }));
    observed.at(-1).afterInvalidateCalls = calls;
    observed.at(-1).deniedErrors = errors.every(error => error instanceof PublicChartError
      && error.kind === 'permission' && error.retryable === false && error.code === 'PUBLIC_CHART_DENIED');
  }
  t.diagnostic(JSON.stringify(observed));
  assert.ok(observed.every(item => item.outboundCalls === 1), 'HTTP denial must latch independently of rejected body cancellation');
  assert.ok(observed.every(item => item.afterInvalidateCalls === 1 && item.deniedErrors));
});

test('latched 401/403 remains a non-retryable permission error even under repeated refresh pressure', async () => {
  const { createPublicCharts } = await import('../src/public-charts.mjs');
  for (const status of [401, 403]) {
    let calls = 0;
    const client = createPublicCharts({ now: () => 0, fetchImpl: async () => { calls++; return Response.json({}, { status }); } });
    for (let i = 0; i < 10; i++) {
      client.invalidate();
      await assert.rejects(() => client.catalog({ refresh: true }), error => error.code === 'PUBLIC_CHART_DENIED'
        && error.kind === 'permission' && error.retryable === false);
    }
    assert.equal(calls, 1);
  }
});

test('retryable HTTP/network failures do not latch and a correct response remains readable', async () => {
  const { createPublicCharts } = await import('../src/public-charts.mjs');
  for (const failure of [() => Response.json({}, { status: 503 }), () => { throw new TypeError('synthetic network error'); }]) {
    let calls = 0;
    const client = createPublicCharts({ fetchImpl: async () => ++calls === 1 ? failure() : Response.json(catalogBody()) });
    await assert.rejects(() => client.catalog());
    assert.equal((await client.catalog()).charts[0].id, 'discovered-A');
    assert.equal(calls, 2, 'retryable failure permits an explicit retry, never an automatic one');
  }
});

test('catalog and detail share burst4/refill1-per-second budget measured by a local monotonic clock', async t => {
  const { createPublicCharts } = await import('../src/public-charts.mjs');
  let at = 0;
  const requests = [];
  const client = createPublicCharts({ now: () => at, fetchImpl: async url => {
    requests.push({ at, path: new URL(url).pathname });
    return Response.json(String(url).includes('/page/detail/all') ? catalogBody() : detailBody());
  } });
  try {
    await client.catalog();
    for (const start of [0, 10, 20]) await client.detail({ id: 'discovered-A', start });
    const rate = error => error.code === 'PUBLIC_CHART_RATE_LIMIT' && error.kind === 'network' && error.retryable === true;
    await assert.rejects(() => client.detail({ id: 'discovered-A', start: 30 }), rate);
    at = 999;
    await assert.rejects(() => client.detail({ id: 'discovered-A', start: 30 }), rate);
    assert.equal(requests.length, 4, 'initial shared burst is four, not four for each endpoint');
    at = 1000;
    await client.detail({ id: 'discovered-A', start: 30 });
    await assert.rejects(() => client.detail({ id: 'discovered-A', start: 40 }), rate);
    at = 2000;
    await client.detail({ id: 'discovered-A', start: 40 });
    at = 100000;
    for (const start of [50, 60, 70, 80]) await client.detail({ id: 'discovered-A', start });
    await assert.rejects(() => client.detail({ id: 'discovered-A', start: 90 }), rate);
    assert.deepEqual(requests.map(item => item.at), [0, 0, 0, 0, 1000, 2000, 100000, 100000, 100000, 100000]);
  } finally { t.diagnostic(JSON.stringify({ monotonicMilliseconds: at, actualRequests: requests })); }
});

test('late old-generation finalizers cannot delete new reads or release another generation HTTP slot', async t => {
  const { createPublicCharts } = await import('../src/public-charts.mjs');
  const pending = [], outcomes = [];
  const client = createPublicCharts({ now: () => 0, fetchImpl: (_url, options) => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    pending.push({ resolve, signal: options.signal });
    return promise; // Intentionally ignores abort to exercise actual-source stale/lease ownership.
  } });
  const read = () => {
    const outcome = client.catalog().then(value => ({ value }), error => ({ error }));
    outcomes.push(outcome); return outcome;
  };
  try {
    const old = read();
    client.invalidate();
    assert.equal(pending[0].signal.aborted, true);
    const newer = read(), joined = read();
    assert.equal(pending.length, 2);
    pending[0].resolve(Response.json(catalogBody([chart('old-choice')])));
    assert.equal((await old).error.code, 'PUBLIC_CHART_STALE');
    const joinedAfterOldFinally = read();
    assert.equal(pending.length, 2, 'old finally must not delete the newer matching catalog request');
    client.invalidate();
    const third = read();
    assert.equal(pending.length, 3, 'only the old operation released its own slot');
    client.invalidate();
    assert.equal((await read()).error.code, 'PUBLIC_CHART_BUSY');
    assert.equal(pending.length, 3, 'invalidating does not free either still-pending HTTP slot');
    pending[1].resolve(Response.json(catalogBody([chart('also-stale')])));
    for (const outcome of [newer, joined, joinedAfterOldFinally]) assert.equal((await outcome).error.code, 'PUBLIC_CHART_STALE');
    const latest = read(), latestJoined = read();
    assert.equal(pending.length, 4);
    pending[2].resolve(Response.json(catalogBody([chart('third-stale')])));
    assert.equal((await third).error.code, 'PUBLIC_CHART_STALE');
    const latestAfterOldFinally = read();
    assert.equal(pending.length, 4, 'a second late finally must not erase the current coalescing record');
    pending[3].resolve(Response.json(catalogBody([chart('current-choice')])));
    for (const outcome of [latest, latestJoined, latestAfterOldFinally]) assert.equal((await outcome).value.charts[0].id, 'current-choice');
    await assert.rejects(() => client.detail({ id: 'old-choice' }), /目录/);
    assert.equal((await read()).error.code, 'PUBLIC_CHART_RATE_LIMIT', 'four generations still share the same burst');
    t.diagnostic(JSON.stringify({ generationsWithHttp: pending.length, lateResultsRejected: true, matchingNewReadsPreserved: true }));
  } finally {
    pending.forEach(item => item.resolve(Response.json(catalogBody([]))));
    await Promise.all(outcomes);
  }
});

test('in-flight ownership lasts through the body and settles on success, HTTP, network, abort, stream and schema errors', async t => {
  const { createPublicCharts } = await import('../src/public-charts.mjs');
  for (const outcome of ['success', 'http', 'network', 'abort', 'stream', 'schema']) await t.test(outcome, async () => {
    let at = 0;
    const pending = [], reads = [];
    const client = createPublicCharts({ now: () => at, fetchImpl: url => {
      if (String(url).includes('/page/detail/all')) return Promise.resolve(Response.json(catalogBody()));
      let resolve, reject;
      const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
      pending.push({ resolve, reject }); return promise;
    } });
    const read = start => {
      const result = client.detail({ id: 'discovered-A', start }).then(value => ({ value }), error => ({ error }));
      reads.push(result); return result;
    };
    try {
      await client.catalog();
      const first = read(0), joined = read(0), held = read(10);
      assert.equal(pending.length, 2);
      assert.equal((await read(20)).error.code, 'PUBLIC_CHART_BUSY');
      if (outcome === 'success') {
        let controller;
        pending[0].resolve(new Response(new ReadableStream({ start(value) { controller = value; } }), { headers: { 'content-type': 'application/json' } }));
        await Promise.resolve(); await Promise.resolve();
        assert.equal((await read(20)).error.code, 'PUBLIC_CHART_BUSY', 'headers alone must not release the HTTP/body slot');
        controller.enqueue(new TextEncoder().encode(JSON.stringify(detailBody()))); controller.close();
      } else if (outcome === 'http') pending[0].resolve(Response.json({}, { status: 503 }));
      else if (outcome === 'network') pending[0].reject(new TypeError('synthetic network failure'));
      else if (outcome === 'abort') pending[0].reject(new DOMException('synthetic abort', 'AbortError'));
      else if (outcome === 'stream') pending[0].resolve(new Response(new ReadableStream({ start(controller) { controller.error(new Error('synthetic body failure')); } }), { headers: { 'content-type': 'application/json' } }));
      else pending[0].resolve(Response.json({ result: { resultCode: '999999' } }));
      const a = await first, b = await joined;
      assert.equal(Boolean(a.value), outcome === 'success'); assert.equal(Boolean(b.value), outcome === 'success');
      if (a.error) assert.equal(a.error, b.error, 'coalesced failure keeps one underlying operation');
      const replacement = read(20);
      assert.equal(pending.length, 3, `${outcome} must release its own slot without refunding its token`);
      assert.equal((await read(30)).error.code, 'PUBLIC_CHART_BUSY', 'the other held read still owns its slot');
      pending[1].resolve(Response.json(detailBody())); pending[2].resolve(Response.json(detailBody()));
      assert.ok((await held).value); assert.ok((await replacement).value);
      assert.equal((await read(40)).error.code, 'PUBLIC_CHART_RATE_LIMIT');
      at = 1000;
      const repeated = read(20);
      assert.equal(pending.length, 4, 'settled results are not an unbounded response cache');
      pending[3].resolve(Response.json(detailBody())); assert.ok((await repeated).value);
    } finally {
      pending.forEach(item => item.resolve(Response.json(detailBody())));
      await Promise.all(reads);
    }
  });
});

test('catalog refresh and detail bodies share the same aggregate slots across invalidation', async () => {
  const { createPublicCharts } = await import('../src/public-charts.mjs');
  const pending = [], reads = [];
  let calls = 0;
  const client = createPublicCharts({ now: () => 0, fetchImpl: (url, options) => {
    if (++calls === 1) return Promise.resolve(Response.json(catalogBody()));
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    pending.push({ resolve, signal: options.signal, path: new URL(url).pathname }); return promise;
  } });
  const observe = promise => { const read = promise.then(value => ({ value }), error => ({ error })); reads.push(read); return read; };
  try {
    await client.catalog();
    const oldDetail = observe(client.detail({ id: 'discovered-A' }));
    const oldCatalog = observe(client.catalog({ refresh: true }));
    assert.equal(pending[0].signal.aborted, true);
    assert.ok(pending[0].path.includes('/chart/detail/')); assert.ok(pending[1].path.includes('/page/detail/'));
    client.invalidate();
    await assert.rejects(() => client.catalog(), error => error.code === 'PUBLIC_CHART_BUSY');
    assert.equal(calls, 3, 'a pending catalog and an old detail already exhaust the shared two-HTTP limit');
    pending[0].resolve(Response.json(detailBody()));
    assert.equal((await oldDetail).error.code, 'PUBLIC_CHART_STALE');
    const latest = observe(client.catalog());
    assert.equal(calls, 4);
    pending[1].resolve(Response.json(catalogBody([chart('old-catalog')])));
    assert.equal((await oldCatalog).error.code, 'PUBLIC_CHART_STALE');
    pending[2].resolve(Response.json(catalogBody()));
    assert.equal((await latest).value.charts[0].id, 'discovered-A');
  } finally {
    pending.forEach(item => item.resolve(Response.json(catalogBody([]))));
    await Promise.all(reads);
  }
});

test('bounded detail rejects mismatched IDs, over-limit arrays and untrusted field shapes', async () => {
  const { createPublicCharts } = await import('../src/public-charts.mjs');
  for (const body of [detailBody([], 'wrong-id'), detailBody(Array.from({ length: 11 }, (_, i) => song(`s${i}`))),
    detailBody([{ ...song(), artistID: Array(33).fill('artist-A') }]), detailBody([{ ...song(), albumID: '../album' }]),
    { ...detailBody(), result: { resultCode: 'not-success' } }, { result: { resultCode: '000000' }, chartInfoEx: {} }]) {
    let calls = 0;
    const client = createPublicCharts({ fetchImpl: async () => Response.json(++calls === 1 ? catalogBody() : body) });
    await client.catalog(); await assert.rejects(() => client.detail({ id: 'discovered-A' }), /响应/);
  }
});

test('empty results remain empty, unsafe covers are omitted, and the final allowed page cannot continue', async () => {
  const { createPublicCharts } = await import('../src/public-charts.mjs');
  const empty = createPublicCharts({ fetchImpl: async () => Response.json(catalogBody([])) });
  assert.deepEqual((await empty.catalog()).charts, []);
  let calls = 0;
  const client = createPublicCharts({ fetchImpl: async () => Response.json(++calls === 1 ? catalogBody() : detailBody(Array(10).fill({ ...song(), picture: { bigImgURL: 'javascript:alert(1)' } }), 'discovered-A', '999')) });
  await client.catalog();
  const result = await client.detail({ id: 'discovered-A', start: 490 });
  assert.equal(result.hasMore, false); assert.equal(result.nextStart, 500); assert.equal(result.tracks.length, 1);
  assert.equal(result.tracks[0].coverUrl, undefined);
});

const song = (id = 'track-A') => ({ contentID: id, contentType: '1', contentName: '真实曲目结构', artistID: ['artist-A'], artistName: '歌手甲',
  albumID: 'album-A', albumName: '专辑甲', rankInfo: { mode: '2', score: '999', orderId: '1' }, contentExInfo: 'must-not-leak' });
const detailBody = (songs = [song()], id = 'discovered-A', total = '200') => ({ result: { resultCode: '000000' },
  chartInfoEx: { chartInfo: { ...chart(id), totalCount: total, releaseDate: '20261116224816' }, songSimpleInfos: songs } });

test('only discovered IDs can read paged details through existing track normalization', async t => {
  const { client, agent, requests } = await service(t, catalogBody());
  await client.catalog();
  await assert.rejects(() => client.detail({ id: 'not-discovered' }), /目录/);
  assert.equal(requests.length, 1, 'unknown ID must issue no request');
  agent.get(origin).intercept({ path: '/music-operation-service/v1/service/chart/detail/bychartid?chartID=discovered-A&start=0&limit=10', method: 'GET' })
    .reply(200, detailBody(), { headers: { 'content-type': 'application/json' } });
  const result = await client.detail({ id: 'discovered-A', start: 0, limit: 10 });
  assert.equal(result.playlist.kind, 'chart');
  assert.equal(result.playlist.count, 200, 'detail total is distinct from catalog299');
  assert.equal(result.updatedAtRaw, '20261116224816');
  assert.equal(result.tracks[0].id, 'track-A');
  assert.deepEqual(result.tracks[0].artists, [{ id: 'artist-A', name: '歌手甲' }]);
  assert.equal(result.tracks[0].album.id, 'album-A');
  assert.equal(result.tracks[0].contentExInfo, undefined);
  assert.equal(result.tracks[0].rankInfo, undefined, 'unknown rank semantics never reach renderer');
  assert.equal(result.nextStart, 10);
  assert.equal(result.hasMore, false, 'short page stops despite advertised total');
});
