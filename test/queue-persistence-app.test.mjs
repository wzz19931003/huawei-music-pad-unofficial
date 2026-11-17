import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import test from 'node:test';

// Execute the actual App effects/action together with shared hook refs. Only
// scheduling, player snapshots and API results are synthetic: this is not proof
// of React scheduling, disk durability, Audio or native installation.
const source = readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8');
const start = source.indexOf('// 队列持久化');
const end = source.indexOf('// 播放模式以落盘的设置为准', start);
assert.ok(start >= 0 && end > start, 'actual App queue effects must exist');
const actionStart = source.indexOf('const runUpdateAction = async ');
const actionArrow = source.indexOf('=>', actionStart);
const actionEnd = source.indexOf('\n  const openUpdates =', actionArrow);
assert.ok(actionStart >= 0 && actionArrow > actionStart && actionEnd > actionArrow, 'actual update preflight must exist');
const actionBody = source.slice(actionArrow + 2, actionEnd).trim().replace(/;$/, '');
const script = new Script(`((player) => {
  ${source.slice(start, end)}
  return async (action) => ${actionBody};
})(frame)`);
const track = { id: 'synthetic-local-queue', title: 'Synthetic local queue', artists: [] };

function host({ save = async () => ({ ok: true }), load = async () => null } = {}) {
  const refs = [], effects = [], timers = new Map(), intervals = new Map();
  const calls = { saves: [], installs: 0, busy: [], errors: [], states: [], restores: [], events: [], notices: [] };
  const downloaded = { status: 'downloaded', currentVersion: '0.2.0', version: '0.2.1', message: 'Synthetic verified download' };
  let refCursor = 0, effectCursor = 0, nextTimer = 0, action;
  const playerRef = { current: null };
  const context = createContext({
    frame: null, playerRef, booting: false, auth: { authenticated: true },
    useRef(initial) { return refs[refCursor++] ??= { current: initial }; },
    useEffect(setup, deps) {
      const at = effectCursor++, previous = effects[at];
      if (previous && deps.length === previous.deps.length && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
      previous?.cleanup?.();
      effects[at] = { deps, cleanup: setup() };
    },
    saveTimer: { current: undefined }, updateActionBusyRef: { current: false },
    showToast: message => calls.notices.push(message),
    setUpdateActionBusy: value => calls.busy.push(value), setUpdateActionError: value => calls.errors.push(value),
    setUpdateState: value => calls.states.push(value),
    window: {
      setTimeout(callback, delay) { assert.equal(delay, 1200, 'keep the actual debounce contract'); const id = ++nextTimer; timers.set(id, callback); return id; },
      clearTimeout(id) { timers.delete(id); },
      setInterval(callback, delay) { assert.equal(delay, 10000, 'keep the actual periodic contract'); const id = ++nextTimer; intervals.set(id, callback); return id; },
      clearInterval(id) { intervals.delete(id); },
    },
    api: {
      saveQueue(...args) { const snapshot = structuredClone(args); calls.saves.push(snapshot); calls.events.push(['save', snapshot]); return save(...args); },
      loadQueue: load,
      updates: {
        install: async () => { calls.installs++; calls.events.push(['install']); return downloaded; },
        state: async () => downloaded,
      },
    },
  });
  return {
    calls, timers, intervals, playerRef,
    render(queue, index, position = 7, playing = false) {
      refCursor = 0; effectCursor = 0;
      context.frame = playerRef.current = {
        queue, index, position, positionCommit: { current: position }, playing,
        toggle() { calls.events.push(['pause']); },
        restore(...args) { calls.restores.push(structuredClone(args)); },
      };
      action = script.runInContext(context);
    },
    run: () => action('install'),
    async flush() { const callbacks = [...timers.values()]; timers.clear(); await Promise.all(callbacks.map(callback => callback())); },
    async tick() { await Promise.all([...intervals.values()].map(callback => callback())); },
    stop() { effects.forEach(effect => effect.cleanup?.()); assert.equal(timers.size, 0); assert.equal(intervals.size, 0); },
  };
}

test('actual App effect persists the explicit last-row removal instead of resurrecting its saved queue', async () => {
  const app = host();
  try {
    app.render([track], 0, 7); await app.flush();
    assert.deepEqual(app.calls.saves, [[[track], 0, 7]]);
    app.render([], -1, 7); await app.flush();
    assert.deepEqual(app.calls.saves.at(-1), [[], -1, 0], 'last removal must send the existing empty queue contract, never keep the prior saved track');
    assert.equal(app.calls.saves.length, 2);
  } finally { app.stop(); }
});

test('initial empty App state never erases a queue still waiting for restore', async () => {
  const app = host();
  try {
    app.render([], -1, 0); await app.flush();
    app.render([], -1, 0); await app.flush(); await app.tick();
    assert.deepEqual(app.calls.saves, []);
  } finally { app.stop(); }
});

test('explicit last-row removal cancels an older debounced populated snapshot', async () => {
  const app = host();
  try {
    app.render([track], 0, 12);
    app.render([], -1, 12); await app.flush();
    assert.deepEqual(app.calls.saves, [[[], -1, 0]]);
  } finally { app.stop(); }
});

test('late startup restore cannot undo an explicit last-row removal while its load was pending', async () => {
  let release;
  const app = host({ load: () => new Promise(resolve => { release = resolve; }) });
  try {
    app.render([], -1, 0);
    app.render([track], 0, 7); app.render([], -1, 7);
    release({ ok: true, data: { tracks: [track], index: 0, positionSeconds: 7 } });
    await Promise.resolve();
    assert.deepEqual(app.calls.restores, [], 'the actual shared observed ref must prevent late resurrection');
  } finally { app.stop(); }
});

test('ordinary initial saved queue still restores when the user has not touched playback', async () => {
  const app = host({ load: async () => ({ ok: true, data: { tracks: [track], index: 0, positionSeconds: 7 } }) });
  try {
    app.render([], -1, 0); await Promise.resolve();
    assert.deepEqual(app.calls.restores, [[[track], 0, 7]]);
  } finally { app.stop(); }
});

test('startup load still cannot replace an already populated user queue', async () => {
  let release;
  const app = host({ load: () => new Promise(resolve => { release = resolve; }) });
  try {
    app.render([], -1, 0); app.render([track], 0);
    release({ ok: true, data: { tracks: [track], index: 0, positionSeconds: 7 } });
    await Promise.resolve();
    assert.deepEqual(app.calls.restores, []);
  } finally { app.stop(); }
});

test('install preflight waits for explicit empty-queue saving rather than reviving old tracks after update', async () => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const app = host({ save: () => held });
  try {
    app.render([track], 0); app.render([], -1);
    const running = app.run();
    await Promise.resolve();
    assert.deepEqual(app.calls.saves, [[[], -1, 0]]);
    assert.equal(app.calls.installs, 0, 'installation cannot race ahead of the held empty save');
    release({ ok: true }); await running;
    assert.equal(app.calls.installs, 1);
    assert.equal(app.timers.size, 0, 'cancel the older debounced snapshot before install persistence');
  } finally { app.stop(); }
});

test('failed empty-queue saving blocks install and retains the native downloaded candidate', async () => {
  const app = host({ save: async () => ({ ok: false }) });
  try {
    app.render([track], 0); app.render([], -1); await app.run();
    assert.deepEqual(app.calls.saves, [[[], -1, 0]]);
    assert.equal(app.calls.installs, 0);
    assert.ok(app.calls.errors.some(message => typeof message === 'string' && message.length > 0));
    assert.equal(app.calls.states.at(-1)?.status, 'downloaded');
    assert.equal(app.calls.busy.at(-1), false);
  } finally { app.stop(); }
});

test('install before any user queue activity does not erase a still-unrestored stored queue', async () => {
  const app = host();
  try {
    app.render([], -1); await app.run();
    assert.deepEqual(app.calls.saves, []);
    assert.equal(app.timers.size, 0);
    assert.equal(app.calls.installs, 1);
  } finally { app.stop(); }
});

test('ordinary populated install preflight keeps its existing tracks, index and committed position contract', async () => {
  const app = host();
  try {
    app.render([track], 0, 4);
    app.playerRef.current.positionCommit.current = 7;
    await app.run();
    assert.deepEqual(app.calls.saves, [[[track], 0, 7]]);
    assert.equal(app.calls.installs, 1);
  } finally { app.stop(); }
});

test('held install save followed by last-row removal waits for the newer empty save acknowledgement', async () => {
  const releases = [];
  const app = host({ save: () => new Promise(resolve => releases.push(resolve)) });
  try {
    app.render([track], 0, 7);
    const running = app.run();
    assert.deepEqual(app.calls.saves, [[[track], 0, 7]]);
    app.render([], -1, 7);
    releases[0]({ ok: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.calls.installs, 0, 'old populated save success must not install before the explicit empty save is acknowledged');
    assert.deepEqual(app.calls.saves, [[[track], 0, 7], [[], -1, 0]]);
    assert.equal(app.timers.size, 0, 'preflight must consume the pending newer debounce');
    releases[1]({ ok: true }); await running;
    assert.equal(app.calls.installs, 1);
    assert.deepEqual(app.calls.events.map(event => event[0]), ['save', 'save', 'install']);
  } finally { app.stop(); }
});

for (const [label, failure] of [['ok:false', { ok: false }], ['null', null]]) {
  test(`explicit empty autosave ${label} retries on the periodic callback after recovery without new edits`, async t => {
    let recovered = false;
    const app = host({ save: async () => recovered ? { ok: true } : failure });
    try {
      app.render([track], 0, 7); app.render([], -1, 7);
      await app.flush(); await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(app.calls.saves, [[[], -1, 0]]);
      recovered = true;
      await app.tick(); await new Promise(resolve => setImmediate(resolve));
      t.diagnostic(JSON.stringify({ requestsAfterRecovery: app.calls.saves, notices: app.calls.notices }));
      assert.equal(app.calls.saves.length, 2, 'failed explicit empty save must stay pending until the recovered periodic retry acknowledges it');
      assert.deepEqual(app.calls.saves.at(-1), [[], -1, 0]);
      assert.equal(app.calls.notices.length, 1, 'one save-failure notice, not a notice on every retry');
      for (let i = 0; i < 6; i++) await app.tick();
      assert.equal(app.calls.saves.length, 2, 'acknowledged empty state must stop periodic retries');
      assert.equal(app.calls.notices.length, 1);
    } finally { app.stop(); }
  });
}

test('unacknowledged explicit empty state retries at most once per periodic tick with one notice per failure streak', async () => {
  let recovered = false;
  const app = host({ save: async () => recovered ? { ok: true } : { ok: false } });
  try {
    app.render([track], 0); app.render([], -1); await app.flush();
    for (let i = 0; i < 6; i++) await app.tick();
    assert.equal(app.calls.saves.length, 7, 'one debounce plus six periodic attempts, no immediate retry loop');
    assert.equal(app.timers.size, 0);
    assert.equal(app.calls.notices.length, 1, 'periodic failures must not flood toasts');
    recovered = true; await app.tick(); await app.tick();
    assert.equal(app.calls.saves.length, 8, 'one recovered acknowledgement stops empty retries');
    assert.equal(app.calls.notices.length, 1);
  } finally { app.stop(); }
});

test('rejected empty autosave is handled and remains retryable without an unhandled rejection', async () => {
  let recovered = false;
  const app = host({ save: async () => {
    if (!recovered) throw new Error('synthetic save rejection');
    return { ok: true };
  } });
  try {
    app.render([track], 0); app.render([], -1); await app.flush(); await app.tick();
    assert.equal(app.calls.saves.length, 2);
    assert.equal(app.calls.notices.length, 1);
    recovered = true; await app.tick(); await app.tick();
    assert.equal(app.calls.saves.length, 3);
    assert.deepEqual(app.calls.saves.at(-1), [[], -1, 0]);
  } finally { app.stop(); }
});

test('in-flight autosave coalesces periodic callbacks and a newer clear remains pending after old success', async () => {
  let release;
  let first = true;
  const app = host({ save: () => {
    if (first) { first = false; return new Promise(resolve => { release = resolve; }); }
    return Promise.resolve({ ok: true });
  } });
  try {
    app.render([track], 0, 7);
    const oldSaving = app.flush();
    app.render([], -1, 7); await app.flush();
    for (let i = 0; i < 6; i++) await app.tick();
    assert.equal(app.calls.saves.length, 1, 'do not pile up requests behind an unresolved autosave');
    release({ ok: true }); await oldSaving;
    await app.tick();
    assert.deepEqual(app.calls.saves, [[[track], 0, 7], [[], -1, 0]], 'the old nonempty acknowledgement must not clear newer empty intent');
    await app.tick(); assert.equal(app.calls.saves.length, 2);
  } finally { app.stop(); }
});

test('nonempty debounce and periodic save retain their rendered and committed position contracts', async () => {
  const app = host();
  try {
    app.render([track], 0, 4);
    app.playerRef.current.positionCommit.current = 15;
    await app.flush(); await app.tick();
    assert.deepEqual(app.calls.saves, [[[track], 0, 4], [[track], 0, 15]]);
  } finally { app.stop(); }
});

test('install waits for an index-only mutation then pauses the latest playing snapshot after acknowledgement', async () => {
  const releases = [], queue = [track, { ...track, id: 'synthetic-second-row' }];
  const app = host({ save: () => new Promise(resolve => releases.push(resolve)) });
  try {
    app.render(queue, 0, 7, true);
    const running = app.run();
    app.render(queue, 1, 13, true);
    releases[0]({ ok: true }); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(app.calls.saves, [[queue, 0, 7], [queue, 1, 13]]);
    assert.deepEqual(app.calls.events.map(event => event[0]), ['save', 'save'], 'no pause or install until the current index has been saved');
    await app.run();
    assert.equal(app.calls.saves.length, 2, 'busy action ignores duplicate install clicks without blocking queue mutation');
    releases[1]({ ok: true }); await running;
    assert.deepEqual(app.calls.events.map(event => event[0]), ['save', 'save', 'pause', 'install']);
  } finally { app.stop(); }
});

test('null install-save failure retains the downloaded candidate and a second attempt can acknowledge the clear', async () => {
  let recovered = false;
  const app = host({ save: async () => recovered ? { ok: true } : null });
  try {
    app.render([track], 0); app.render([], -1); await app.run();
    assert.equal(app.calls.installs, 0);
    assert.equal(app.calls.states.at(-1)?.status, 'downloaded');
    assert.equal(app.calls.busy.at(-1), false);
    assert.ok(app.calls.errors.at(-1));
    recovered = true; await app.run(); await app.tick();
    assert.deepEqual(app.calls.saves, [[[], -1, 0], [[], -1, 0]]);
    assert.equal(app.calls.installs, 1);
    assert.equal(app.calls.errors.at(-1), null);
    assert.equal(app.calls.busy.at(-1), false);
  } finally { app.stop(); }
});

test('a failed newer clear after a held old install save blocks install and remains retryable', async () => {
  let release, recovered = false, first = true;
  const app = host({ save: () => {
    if (first) { first = false; return new Promise(resolve => { release = resolve; }); }
    return Promise.resolve(recovered ? { ok: true } : { ok: false });
  } });
  try {
    app.render([track], 0, 7, true);
    const running = app.run();
    app.render([], -1, 7);
    release({ ok: true }); await running;
    assert.deepEqual(app.calls.saves, [[[track], 0, 7], [[], -1, 0]]);
    assert.equal(app.calls.installs, 0);
    assert.ok(!app.calls.events.some(event => event[0] === 'pause'), 'a failed preflight must not pause the stale player');
    assert.equal(app.calls.states.at(-1)?.status, 'downloaded');
    assert.equal(app.calls.busy.at(-1), false);
    recovered = true; await app.tick(); await app.tick();
    assert.deepEqual(app.calls.saves.at(-1), [[], -1, 0]);
    assert.equal(app.calls.saves.length, 3, 'periodic callback can recover the cancelled explicit clear without another edit');
  } finally { app.stop(); }
});

test('continuous queue mutation bounds preflight to three saves and leaves the latest state retryable', async () => {
  let app, editing = true, mutations = 0;
  app = host({ save: async () => {
    if (editing) {
      assert.ok(++mutations <= 4, 'test safety limit if production loses its bounded retry guard');
      app.render([{ ...track, id: `synthetic-mutation-${mutations}` }], 0, 7);
    }
    return { ok: true };
  } });
  try {
    app.render([track], 0, 7, true); await app.run();
    assert.equal(app.calls.saves.length, 3, 'continuous edits abort, rather than spin or install an unacknowledged state');
    assert.equal(app.calls.installs, 0);
    assert.equal(app.calls.states.at(-1)?.status, 'downloaded');
    assert.equal(app.calls.busy.at(-1), false);
    assert.ok(app.calls.errors.at(-1));
    editing = false; await app.flush();
    assert.deepEqual(app.calls.saves.at(-1)[0], app.playerRef.current.queue, 'latest pending debounce is not discarded by the bounded abort');
  } finally { app.stop(); }
});
