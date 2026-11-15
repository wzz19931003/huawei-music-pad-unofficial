import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import * as modes from '../src/renderer/playback-modes.mjs';

const track = (id, changes = {}) => ({
  id, title: `Song ${id}`, artists: [{ id: 'artist-a', name: '歌手 A' }], available: true, ...changes,
});
const ids = tracks => tracks.map(item => item.id);

test('heart explicitly refuses absent or unplayable favorites without making requests', async () => {
  const never = () => { assert.fail('no favorites must not issue a request'); };
  for (const favorites of [undefined, [], {}, [null, track('x', { available: false }), track('', {}), track('y', { title: '' })]]) {
    assert.deepEqual(await modes.buildHeartQueue({ favorites, loadArtist: never, search: never }), {
      status: 'no-favorites', queue: [], recommendations: [], requests: 0, failures: 0,
    });
  }
});

test('heart alternates favorite seeds with real tracks returned by the existing artist callback', async () => {
  const favorites = [track('f1'), track('f2')];
  const discovered = [track('new1'), track('new2')];
  const before = structuredClone(favorites);
  const calls = [];
  const result = await modes.buildHeartQueue({
    favorites,
    loadArtist: async (...args) => { calls.push(args); return { tracks: discovered }; },
  });
  assert.deepEqual(result, {
    status: 'ready', queue: [favorites[0], discovered[0], favorites[1], discovered[1]],
    recommendations: discovered, requests: 1, failures: 0,
  });
  assert.deepEqual(calls, [['artist-a']], 'accept the existing unary IPC wrapper without a new request protocol');
  assert.deepEqual(favorites, before);
  assert.equal(result.queue[1], discovered[0], 'return the real catalog track, not a generated substitute');
});

test('heart admits only valid available novel IDs with observed artist or album evidence', async () => {
  const album = { id: 'album-1', title: 'Common album title' };
  const favorites = [track('f1', { album }), track('f1'), track('f2'), track('f3'), track('blocked', { available: false })];
  const accepted = [
    track('by-id', { artists: [{ id: 'artist-a', name: 'Alias' }] }),
    track('by-name', { artists: [{ name: '  歌手   a  ' }] }),
    track('by-album', { artists: [], album: { id: 'album-1', title: 'Other title' } }),
  ];
  const tracks = [
    null, track(''), track(5), track('blank-title', { title: ' ' }),
    track('unavailable', { available: false }), track('truthy', { available: 'true' }),
    track('bad-artists', { artists: [null] }), track('missing-artists', { artists: undefined }),
    track('bad-artist-name', { artists: [{ id: 'artist-a', name: '' }] }),
    track('bad-album', { album: { id: '', title: 'Broken' } }),
    track('f2'), track('blocked'),
    track('unrelated', { artists: [{ id: 'other', name: 'Else' }], album: { id: 'other-album', title: album.title } }),
    accepted[0], accepted[0], accepted[1], accepted[2],
  ];
  const result = await modes.buildHeartQueue({ favorites, loadArtist: async () => ({ tracks }) });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.recommendations, accepted);
  assert.deepEqual(ids(result.queue), ['f1', 'by-id', 'f2', 'by-name', 'f3', 'by-album']);
  assert.equal(new Set(ids(result.queue)).size, result.queue.length);
});

test('heart uses real unary search results when artist loading finds no candidates', async () => {
  const calls = [];
  const result = await modes.buildHeartQueue({
    favorites: [track('f1'), track('f2')],
    loadArtist: async (...args) => { calls.push(['artist', ...args]); return { tracks: [track('f1')] }; },
    search: async (...args) => { calls.push(['search', ...args]); return { tracks: [track('new1'), track('new2')] }; },
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(ids(result.queue), ['f1', 'new1', 'f2', 'new2']);
  assert.equal(result.requests, 2);
  assert.deepEqual(calls, [['artist', 'artist-a'], ['search', '歌手 A']]);
});

test('heart never disguises empty, malformed, failed, or missing API data as recommendations', async () => {
  for (const [reply, failures] of [
    [() => ({ tracks: [] }), 0],
    [() => ({ tracks: [track('favorite'), track('other', { artists: [{ name: 'Unrelated' }] })] }), 0],
    [() => null, 2], [() => ({ tracks: {} }), 2], [() => [track('new')], 2],
    [() => ({ ok: false, error: { kind: 'network' }, tracks: [track('stale-data')] }), 2],
    [() => { throw new Error('offline'); }, 2],
    [async () => { throw new Error('network'); }, 2],
  ]) {
    const result = await modes.buildHeartQueue({ favorites: [track('favorite')], loadArtist: reply, search: reply });
    assert.deepEqual(result, { status: 'no-candidates', queue: [], recommendations: [], requests: 2, failures });
  }
  assert.deepEqual(await modes.buildHeartQueue({ favorites: [track('favorite')] }), {
    status: 'no-candidates', queue: [], recommendations: [], requests: 0, failures: 0,
  });
});

test('heart plans deduplicated artist, artist-name, and album searches from seed metadata only', async () => {
  for (const [favorite, candidate, expectedCalls] of [
    [track('f', { artists: [{ name: 'Name only' }] }), track('new', { artists: [{ name: 'Name only' }] }), [['search', 'Name only']]],
    [track('f', { artists: [], album: { id: 'album', title: 'Album only' } }),
      track('new', { artists: [], album: { id: 'album', title: 'Album only' } }), [['search', 'Album only']]],
  ]) {
    const calls = [];
    const result = await modes.buildHeartQueue({ favorites: [favorite],
      loadArtist: async id => { calls.push(['artist', id]); return { tracks: [] }; },
      search: async query => { calls.push(['search', query]); return { tracks: [candidate] }; },
    });
    assert.equal(result.status, 'ready');
    assert.deepEqual(calls, expectedCalls);
  }
  const calls = [];
  const f2 = track('f2', { artists: [{ id: 'artist-b', name: '歌手 B' }] });
  const newB = track('new-b', { artists: f2.artists });
  const result = await modes.buildHeartQueue({ favorites: [track('f1'), track('f1'), f2],
    loadArtist: async id => { calls.push(['artist', id]); return { tracks: id === 'artist-a' ? [] : [track('new-a'), newB] }; },
    search: async query => { calls.push(['search', query]); return { tracks: [track('new-a')] }; },
  });
  assert.deepEqual(ids(result.recommendations), ['new-a', 'new-b']);
  assert.deepEqual(calls, [['artist', 'artist-a'], ['search', '歌手 A'], ['artist', 'artist-b']]);
});

test('heart exposes an already-aborted signal without issuing requests or fallback', async () => {
  const controller = new AbortController();
  controller.abort('account changed');
  const calls = [];
  for (const favorites of [[], [track('f')]]) {
    const result = await modes.buildHeartQueue({ favorites, signal: controller.signal,
      loadArtist: async id => { calls.push(id); return { tracks: [track('new')] }; },
    });
    assert.deepEqual(result, { status: 'aborted', queue: [], recommendations: [], requests: 0, failures: 0 });
  }
  assert.deepEqual(calls, []);
});

test('heart aborts a non-cooperative pending IPC read and ignores late results', { timeout: 1000 }, async () => {
  const controller = new AbortController();
  let finish;
  let searchCalls = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  const collecting = modes.buildHeartQueue({ favorites: [track('f')], signal: controller.signal,
    loadArtist: () => pending,
    search: async () => { searchCalls += 1; return { tracks: [track('fallback')] }; },
  });
  controller.abort();
  const result = await collecting;
  assert.deepEqual(result, { status: 'aborted', queue: [], recommendations: [], requests: 1, failures: 0 });
  finish({ tracks: [track('too-late')] });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(result.recommendations, []);
  assert.equal(searchCalls, 0);
});

test('heart request budgets are finite hard caps even for malformed or excessive options', async () => {
  assert.deepEqual(modes.HEART_LIMITS, {
    maxFavoriteSeeds: 24, maxSeedArtists: 4, maxRequests: 8, maxRecommendations: 24, maxTracksPerResponse: 100,
  });
  assert.equal(Object.isFrozen(modes.HEART_LIMITS), true);
  const favorites = Array.from({ length: 30 }, (_, i) => track(`f${i}`, { artists: [{ id: `a${i}`, name: `Artist ${i}` }] }));
  for (const [maxRequests, expected] of [[undefined, 8], [3, 3], [2.8, 2], [0, 0], [-1, 0], [999, 8], [Infinity, 8], [NaN, 8], ['2', 8]]) {
    const calls = [];
    const callback = async value => { calls.push(value); return { tracks: [] }; };
    const result = await modes.buildHeartQueue({ favorites, loadArtist: callback, search: callback, maxRequests });
    assert.equal(result.requests, expected);
    assert.equal(calls.length, expected);
    assert.equal(result.status, 'no-candidates');
  }
});

test('heart bounds distinct seed artists instead of spending the entire request budget on a large library', async () => {
  const favorites = Array.from({ length: 12 }, (_, i) => track(`f${i}`, { artists: [{ id: `a${i}`, name: `Artist ${i}` }] }));
  favorites.splice(1, 0, track('duplicate-artist'));
  favorites[0] = track('f0');
  for (const [maxSeedArtists, expectedIds] of [[undefined, ['artist-a', 'a1', 'a2', 'a3']],
    [2, ['artist-a', 'a1']], [999, ['artist-a', 'a1', 'a2', 'a3']], [0, []]]) {
    const calls = [];
    const result = await modes.buildHeartQueue({ favorites, maxSeedArtists,
      loadArtist: async id => { calls.push(id); return { tracks: [] }; },
    });
    assert.deepEqual(calls, expectedIds);
    assert.equal(result.requests, expectedIds.length);
  }
});

test('heart caps favorite seeds but excludes every provided favorite ID, including unsampled ones', async () => {
  const favorites = Array.from({ length: 40 }, (_, i) => track(`f${i}`));
  const candidates = [favorites[39], ...Array.from({ length: 40 }, (_, i) => track(`new${i}`))];
  for (const [maxFavoriteSeeds, count] of [[undefined, 24], [3, 3], [999, 24], [0, 0]]) {
    let calls = 0;
    const result = await modes.buildHeartQueue({ favorites, maxFavoriteSeeds,
      loadArtist: async () => { calls += 1; return { tracks: candidates }; },
    });
    assert.equal(result.status, count ? 'ready' : 'no-candidates');
    assert.equal(result.queue.length, count * 2);
    assert.deepEqual(ids(result.queue.filter((_, i) => i % 2 === 0)), ids(favorites.slice(0, count)));
    assert.deepEqual(ids(result.recommendations), Array.from({ length: count }, (_, i) => `new${i}`));
    assert.equal(calls, count ? 1 : 0);
  }
});

test('heart returns strictly alternating pairs and stops once its recommendation limit is met', async () => {
  const favorites = Array.from({ length: 5 }, (_, i) => track(`f${i}`));
  for (const [maxRecommendations, expected] of [[2, 2], [1, 1], [0, 0], [999, 5]]) {
    let calls = 0;
    const reply = async () => { calls += 1; return { tracks: Array.from({ length: 40 }, (_, i) => track(`new${i}`)) }; };
    const result = await modes.buildHeartQueue({ favorites, loadArtist: reply, search: reply, maxRecommendations });
    assert.equal(result.status, expected ? 'ready' : 'no-candidates');
    assert.equal(result.queue.length, expected * 2);
    assert.equal(result.recommendations.length, expected);
    assert.equal(calls, expected ? 1 : 0);
    assert.equal(result.queue.every((item, i) => i % 2 === 0 ? item.id.startsWith('f') : item.id.startsWith('new')), true);
  }
  const partial = await modes.buildHeartQueue({ favorites, loadArtist: async () => ({ tracks: [track('only-new')] }) });
  assert.deepEqual(ids(partial.queue), ['f0', 'only-new'], 'do not append unpaired favorites or repeat IDs to pad the queue');
});

test('heart bounds response scanning even when the server sends oversized or duplicate pages', async () => {
  for (const [maxTracksPerResponse, limit] of [[undefined, 100], [2, 2], [999, 100], [0, 0]]) {
    const raw = Array.from({ length: limit + 1 }, () => track('favorite'));
    raw[limit] = track('beyond-the-cap');
    let scanned = 0;
    const tracks = new Proxy(raw, { get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/u.test(key)) scanned += 1;
      return Reflect.get(target, key, receiver);
    } });
    const result = await modes.buildHeartQueue({ favorites: [track('favorite')], maxTracksPerResponse,
      loadArtist: async () => ({ tracks }),
    });
    assert.deepEqual(result, {
      status: 'no-candidates', queue: [], recommendations: [], requests: limit ? 1 : 0, failures: 0,
    });
    assert.equal(scanned, limit);
  }
});

test('heart treats callback AbortError as cancellation, never as a failed request to retry', async () => {
  for (const loadArtist of [() => { throw new DOMException('cancelled', 'AbortError'); },
    async () => { throw new DOMException('cancelled', 'AbortError'); }]) {
    let fallbacks = 0;
    const result = await modes.buildHeartQueue({ favorites: [track('f')], loadArtist,
      search: async () => { fallbacks += 1; return { tracks: [track('fallback')] }; },
    });
    assert.deepEqual(result, { status: 'aborted', queue: [], recommendations: [], requests: 1, failures: 0 });
    assert.equal(fallbacks, 0);
  }
});

test('heart discards partial recommendations if cancellation happens during a later request', async () => {
  const controller = new AbortController();
  const result = await modes.buildHeartQueue({ favorites: [track('f1'), track('f2')], signal: controller.signal,
    loadArtist: async () => ({ tracks: [track('partial')] }),
    search: async () => { controller.abort(); return { tracks: [track('after-abort')] }; },
  });
  assert.deepEqual(result, { status: 'aborted', queue: [], recommendations: [], requests: 2, failures: 0 });
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('heart cleans up abort listeners after success, failure, and a late rejection', async () => {
  for (const succeeds of [true, false]) {
    const controller = new AbortController();
    await modes.buildHeartQueue({ favorites: [track('f')], signal: controller.signal,
      loadArtist: async () => {
        assert.equal(getEventListeners(controller.signal, 'abort').length, 1);
        if (!succeeds) throw new Error('offline');
        return { tracks: [track('new')] };
      },
    });
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  }
  const controller = new AbortController();
  let rejectRead;
  const collecting = modes.buildHeartQueue({ favorites: [track('f')], signal: controller.signal,
    loadArtist: () => new Promise((_, reject) => { rejectRead = reject; }),
  });
  controller.abort();
  assert.equal((await collecting).status, 'aborted');
  rejectRead(new Error('late IPC rejection'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('heart recovers only with real fallback data and never expands to artists seen only in recommendations', async () => {
  const collaboration = track('collaboration', { artists: [
    { id: 'artist-a', name: '歌手 A' }, { id: 'guest', name: 'Guest' },
  ] });
  const result = await modes.buildHeartQueue({ favorites: [track('f1'), track('f2')],
    loadArtist: async () => { throw new Error('artist read failed'); },
    search: async () => ({ tracks: [collaboration,
      track('guest-only', { artists: [{ id: 'guest', name: 'Guest' }] }), track('new')] }),
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(ids(result.recommendations), ['collaboration', 'new']);
  assert.equal(result.requests, 2);
  assert.equal(result.failures, 1);
});

test('shuffle cycle invariants hold across queue sizes, starting indices, and deterministic random streams', () => {
  for (let length = 2; length <= 12; length += 1) {
    for (let start = 0; start < length; start += 1) {
      let seed = 13;
      const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
      let index = start;
      let shuffleState = null;
      const played = [index];
      for (let i = 1; i < length * 4; i += 1) {
        const step = modes.nextPlaybackStep({ mode: 'shuffle', index, length, shuffleState, rng });
        assert.notEqual(step.index, index);
        index = step.index;
        shuffleState = step.shuffleState;
        played.push(index);
      }
      for (let offset = 0; offset < played.length; offset += length) {
        assert.deepEqual(played.slice(offset, offset + length).sort((a, b) => a - b),
          Array.from({ length }, (_, i) => i));
      }
    }
  }
});

test('mode labels and cycling follow the normalized catalog', () => {
  for (let i = 0; i < modes.PLAY_MODES.length; i += 1) {
    const { id, label } = modes.PLAY_MODES[i];
    assert.equal(modes.modeLabel(id), label);
    assert.equal(modes.nextMode(id), modes.PLAY_MODE_ORDER[(i + 1) % 4]);
  }
  assert.equal(modes.modeLabel('sequential'), '列表');
  assert.equal(modes.nextMode('sequential'), 'one');
});

test('catalog has exactly the four requested modes in menu order', () => {
  assert.deepEqual(modes.PLAY_MODES, [
    { id: 'all', label: '列表' },
    { id: 'one', label: '单曲循环' },
    { id: 'shuffle', label: '随机播放' },
    { id: 'heart', label: '心动模式' },
  ]);
  assert.deepEqual(modes.PLAY_MODE_ORDER, ['all', 'one', 'shuffle', 'heart']);
  assert.equal(Object.isFrozen(modes.PLAY_MODES), true);
  assert.equal(modes.PLAY_MODES.every(Object.isFrozen), true);
  assert.equal(Object.isFrozen(modes.PLAY_MODE_ORDER), true);
});

test('legacy sequential and unrecognized settings normalize to list', () => {
  for (const id of modes.PLAY_MODE_ORDER) assert.equal(modes.normalizePlayMode(id), id);
  for (const legacy of ['sequential', 'off', '', null, undefined, 'toString', {}]) {
    assert.equal(modes.normalizePlayMode(legacy), 'all');
  }
});

test('single-repeat applies only to auto-ended, not manual next', () => {
  assert.deepEqual(modes.nextPlaybackStep({ mode: 'one', index: 1, length: 3, auto: true }), {
    index: 1, replay: true, stopped: false, shuffleState: null,
  });
  assert.deepEqual(modes.nextPlaybackStep({ mode: 'one', index: 1, length: 3 }), {
    index: 2, replay: false, stopped: false, shuffleState: null,
  });
  assert.deepEqual(modes.nextPlaybackStep({ mode: 'one', index: 2, length: 3 }), {
    index: 0, replay: false, stopped: false, shuffleState: null,
  });
});

test('single-track queues explicitly request replay in every mode', () => {
  for (const mode of modes.PLAY_MODE_ORDER) {
    for (const auto of [false, true]) {
      assert.deepEqual(modes.nextPlaybackStep({ mode, index: 0, length: 1, auto }), {
        index: 0, replay: true, stopped: false, shuffleState: null,
      });
    }
  }
});

test('empty or malformed queue positions never produce an invalid playable index', () => {
  const stopped = { index: -1, replay: false, stopped: true, shuffleState: null };
  assert.deepEqual(modes.nextPlaybackStep(), stopped);
  for (const length of [0, -1, 1.5, NaN, Infinity, '3']) {
    assert.deepEqual(modes.nextPlaybackStep({ mode: 'one', length, index: 0, auto: true }), stopped);
  }
  for (const index of [-1, -10, 99, NaN, Infinity, 1.5]) {
    assert.deepEqual(modes.nextPlaybackStep({ mode: 'one', length: 3, index, auto: true }), {
      index: 0, replay: false, stopped: false, shuffleState: null,
    });
  }
});

test('shuffle consumes every track once per cycle without repeating at cycle boundaries', () => {
  for (const randomValue of [0, 0.5, 0.999999]) {
    let calls = 0;
    const rng = () => { calls += 1; return randomValue; };
    let index = 1;
    let shuffleState = null;
    const played = [index];
    for (let i = 0; i < 23; i += 1) {
      const next = modes.nextPlaybackStep({
        mode: 'shuffle', length: 4, index, auto: i % 2 === 0, shuffleState, rng,
      });
      assert.notEqual(next.index, index);
      assert.equal(next.replay, false);
      assert.equal(next.stopped, false);
      assert.ok(next.shuffleState);
      index = next.index;
      shuffleState = next.shuffleState;
      played.push(index);
    }
    for (let offset = 0; offset < played.length; offset += 4) {
      assert.deepEqual(played.slice(offset, offset + 4).sort(), [0, 1, 2, 3]);
    }
    assert.ok(calls > 0 && calls <= 30, 'RNG is used with bounded work, never rejection loops');
  }
  const deterministic = modes.nextPlaybackStep({ mode: 'shuffle', index: 1, length: 4, rng: () => 0.999999 });
  assert.equal(deterministic.index, 0);
});

test('shuffle resets stale or malformed cycle state without mutating caller state', () => {
  const prior = modes.nextPlaybackStep({ mode: 'shuffle', index: 1, length: 5, rng: () => 0.5 }).shuffleState;
  Object.freeze(prior.remaining);
  Object.freeze(prior);
  const snapshot = structuredClone(prior);
  for (const shuffleState of [prior, {}, { length: 3, current: 1, remaining: [1, 2] },
    { length: 3, current: 1, remaining: [2, 2] }, { length: 3, current: 1, remaining: [99] },
    { length: 3, current: 1, remaining: Array(1) }]) {
    const step = modes.nextPlaybackStep({ mode: 'shuffle', index: 1, length: 3, shuffleState, rng: () => 0.99 });
    assert.equal(step.index, 0);
    assert.deepEqual(step.shuffleState, { length: 3, current: 0, remaining: [2] });
  }
  assert.deepEqual(prior, snapshot);
  const advanced = modes.nextPlaybackStep({ mode: 'shuffle', index: prior.current, length: 5, shuffleState: prior });
  assert.equal(advanced.index, prior.remaining[0]);
  assert.deepEqual(prior, snapshot);
  const jumped = modes.nextPlaybackStep({ mode: 'shuffle', index: 1, length: 5, shuffleState: prior, rng: () => 0.99 });
  assert.equal(jumped.index, 0, 'a direct selection discards the old cycle');
});

test('shuffle rejects an out-of-contract RNG rather than generating corrupt indices', () => {
  for (const value of [-0.1, 1, 100, NaN, Infinity, '0.5']) {
    assert.throws(() => modes.nextPlaybackStep({ mode: 'shuffle', index: 0, length: 4, rng: () => value }), RangeError);
  }
});

test('list transitions wrap on ended and manual next, including legacy list settings', () => {
  for (const mode of ['all', 'sequential', 'heart']) {
    for (const auto of [false, true]) {
      assert.deepEqual(modes.nextPlaybackStep({ mode, index: 1, length: 3, auto }), {
        index: 2, replay: false, stopped: false, shuffleState: null,
      });
      assert.deepEqual(modes.nextPlaybackStep({ mode, index: 2, length: 3, auto }), {
        index: 0, replay: false, stopped: false, shuffleState: null,
      });
    }
  }
});
