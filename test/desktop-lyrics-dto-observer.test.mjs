// Pure replay of the actual DTO observer helper; no Electron, build or native proof.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source = readFileSync(new URL('../tools/test-wmusic-lyrics-integration.mjs', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../src/main/desktop-lyrics.ts', import.meta.url), 'utf8');
const perSecond = Number(controller.match(/perSecond = (\d+), burst = (\d+)/)?.[1]);
assert.ok(perSecond > 0, 'actual default state capability limit must be discoverable');
const start = source.indexOf('async function state()');
const end = source.indexOf('async function publish(', start);
assert.ok(start >= 0 && end > start, 'exact maintained state helper must exist');
const actual = source.slice(start, end);
async function replay(page = { isClosed: () => false }) {
  const calls = [];
  const context = vm.createContext({
    overlayPage: page,
    ok: result => { assert.equal(result.ok, true); return result.data; },
    primary: async expression => { calls.push({ from: 'primary', expression }); return { ok: true, data: 'primary' }; },
    overlay: async expression => { calls.push({ from: 'overlay', expression }); return { ok: true, data: 'overlay' }; },
    sleep: async ms => { calls.push({ sleep: ms }); },
  });
  const value = await vm.runInContext(actual + '\nstate()', context);
  return { value, calls };
}
test('DTO state observations pace below the actual 10-per-second state capability limit', async () => {
  const result = await replay();
  const firstRead = result.calls.findIndex(x => x.from);
  assert.ok(result.calls.slice(0, firstRead).some(x => x.sleep > 1000 / perSecond && x.sleep <= 500), 'pace before issuing an observation; do not retry or loosen the production limiter');
});
test('DTO observations use the ready secondary state capability, not the real automatic primary producer budget', async () => {
  const result = await replay();
  assert.equal(result.value, 'overlay');
  assert.deepEqual(result.calls.filter(x => x.from), [{ from: 'overlay', expression: 'window.desktopLyrics.state()' }]);
});
for (const [name, page] of [['not yet created', null], ['prior process closed', { isClosed: () => true }]]) {
  test(`DTO observation uses the real primary capability only when the secondary is ${name}`, async () => {
    const result = await replay(page);
    assert.equal(result.value, 'primary');
    assert.deepEqual(result.calls.filter(x => x.from), [{ from: 'primary', expression: 'window.desktop.desktopLyrics.state()' }]);
  });
}
test('DTO observation denial is surfaced immediately rather than retried or fabricated', async () => {
  let reads = 0;
  const context = vm.createContext({ overlayPage: { isClosed: () => false }, sleep: async () => {},
    primary: async () => { assert.fail('ready secondary must not query the primary'); },
    overlay: async () => { reads++; return { ok: false, error: { code: 'DENIED' } }; },
    ok: result => { assert.equal(result.ok, true); return result.data; },
  });
  await assert.rejects(vm.runInContext(actual + '\nstate()', context), error => error.code === 'ERR_ASSERTION');
  assert.equal(reads, 1);
});
