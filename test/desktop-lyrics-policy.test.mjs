import test from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('../src/main/desktop-lyrics-policy.mjs').catch(() => ({}));
export const validPublication = () => ({
  epoch: 1, generation: 7, sequence: 1,
  track: { key: 'track-7', title: '测试歌曲', artist: '测试歌手' },
  clock: { positionMs: 1200, playing: true, rate: 1 },
  current: { timeMs: 1000, text: '你好', translation: 'Hello', segments: [{ timeMs: 1000, text: '你' }, { timeMs: 1500, text: '好' }] },
  next: { timeMs: 3000, text: '下一行' },
});

test('publication is a bounded current/next-only DTO and rejects extra capabilities', async () => {
  const { validatePublication } = await load();
  assert.equal(typeof validatePublication, 'function', 'missing publication boundary');
  const input = validPublication();
  const clean = validatePublication(input);
  assert.deepEqual(clean, input);
  assert.notEqual(clean, input);
  assert.notEqual(clean.current, input.current);
  assert.equal(validatePublication({ ...input, mediaUrl: 'https://invalid.test/audio' }), null);
  assert.equal(validatePublication({ ...input, track: { ...input.track, accountId: 'forbidden' } }), null);
  assert.equal(validatePublication({ ...input, lyrics: [input.current] }), null);
});

test('malformed, nonfinite, excessive text/segments/bytes and inconsistent word boundaries are rejected atomically', async () => {
  const { validatePublication } = await load();
  const source = validPublication();
  const bad = [
    null, [], 'not-an-object', { ...source, generation: -1 }, { ...source, sequence: 1.5 },
    { ...source, clock: { ...source.clock, positionMs: NaN } },
    { ...source, clock: { ...source.clock, rate: Infinity } },
    { ...source, clock: { ...source.clock, playing: 'true' } },
    { ...source, clock: { ...source.clock, positionMs: 86400001 } },
    { ...source, track: { ...source.track, key: 'https://forbidden/id' } },
    { ...source, track: { ...source.track, title: 'x'.repeat(257) } },
    { ...source, track: null },
    { ...source, current: { timeMs: 1000, text: 'x'.repeat(2049) } },
    { ...source, current: { ...source.current, translation: 'x'.repeat(2049) } },
    { ...source, current: { timeMs: 1000, text: 'x'.repeat(129), segments: Array.from({ length: 129 }, () => ({ timeMs: 1000, text: 'x' })) } },
    { ...source, current: { ...source.current, segments: [{ timeMs: 1500, text: '你' }, { timeMs: 1000, text: '好' }] } },
    { ...source, current: { ...source.current, segments: [{ timeMs: 500, text: '你好' }] } },
    { ...source, current: { ...source.current, segments: [{ timeMs: 1000, text: 'wrong-text' }] } },
    { ...source, current: { ...source.current, segments: [{ timeMs: 3000, text: '你好' }] } },
    { ...source, next: { timeMs: 500, text: 'out-of-order' } },
  ];
  const largeLine = { timeMs: 1000, text: '测'.repeat(2048), translation: '译'.repeat(2048),
    segments: Array.from({ length: 128 }, () => ({ timeMs: 1000, text: '测'.repeat(16) })) };
  bad.push({ ...source, current: largeLine, next: { ...largeLine, timeMs: 3000, segments: largeLine.segments.map(segment => ({ ...segment, timeMs: 3000 })) } });
  for (const input of bad) assert.equal(validatePublication(input), null);
  assert.deepEqual(validatePublication(source), source, 'invalid neighbors must never mutate a later valid DTO');
  assert.deepEqual(validatePublication({ ...source, track: null, clock: null, current: null, next: null }),
    { ...source, track: null, clock: null, current: null, next: null });
});

test('sender guard requires the exact live WebContents, top frame and exact document at both ends', async () => {
  const { isTrustedLyricsSender } = await load();
  assert.equal(typeof isTrustedLyricsSender, 'function', 'missing sender guard');
  const url = 'file:///C:/test/desktop-lyrics.html';
  const frame = { url, parent: null, detached: false };
  const expected = { mainFrame: frame, getURL: () => url, isDestroyed: () => false };
  const event = { sender: expected, senderFrame: frame };
  assert.equal(isTrustedLyricsSender(event, expected, url), true);
  for (const bad of [
    { ...event, sender: { ...expected } },
    { ...event, senderFrame: { ...frame, parent: frame } },
    { ...event, senderFrame: null },
  ]) assert.equal(isTrustedLyricsSender(bad, expected, url), false);
  assert.equal(isTrustedLyricsSender(event, expected, `${url}#same-origin-is-not-enough`), false);
  frame.url = `${url}?redirected=1`;
  assert.equal(isTrustedLyricsSender(event, expected, url), false);
  frame.url = url; frame.detached = true;
  assert.equal(isTrustedLyricsSender(event, expected, url), false);
  frame.detached = false;
  expected.getURL = () => 'https://invalid.test/';
  assert.equal(isTrustedLyricsSender(event, expected, url), false);
  expected.isDestroyed = () => true;
  assert.equal(isTrustedLyricsSender(event, expected, url), false);
});

test('preferences sanitize persisted data and reject untrusted overlay patch fields', async () => {
  const { sanitizeLyricsPreferences, validateLyricsPreferencePatch } = await load();
  assert.equal(typeof sanitizeLyricsPreferences, 'function', 'missing preference boundary');
  const defaults = sanitizeLyricsPreferences(null);
  assert.equal(defaults.version, 1);
  assert.equal(defaults.visible, false);
  assert.equal(defaults.locked, false);
  const saved = sanitizeLyricsPreferences({ version: 1, visible: true, locked: true, fontSize: 999, color: 'url(https://bad)',
    highlightColor: '#AAff00', showTranslation: false, wordHighlight: true, position: { x: -1200, y: 80, secret: 'drop' }, token: 'drop' });
  assert.equal(saved.fontSize, 64);
  assert.equal(saved.color, defaults.color);
  assert.equal(saved.highlightColor, '#aaff00');
  assert.deepEqual(saved.position, { x: -1200, y: 80 });
  assert.equal('token' in saved, false);
  assert.equal(sanitizeLyricsPreferences({ version: 99, visible: true }).visible, false);
  assert.equal(validateLyricsPreferencePatch({ visible: true }, 'overlay'), null);
  assert.equal(validateLyricsPreferencePatch({ position: { x: 1, y: 2 } }, 'main'), null);
  assert.equal(validateLyricsPreferencePatch({ fontSize: 65 }, 'overlay'), null);
  assert.equal(validateLyricsPreferencePatch({ color: '#fff' }, 'overlay'), null);
  assert.deepEqual(validateLyricsPreferencePatch({ visible: true, locked: false }, 'main'), { visible: true, locked: false });
  assert.deepEqual(validateLyricsPreferencePatch({ color: '#ABCDEF', fontSize: 32 }, 'overlay'), { color: '#abcdef', fontSize: 32 });
});

test('window bounds stay within the nearest real workarea and survive removed/negative-coordinate displays', async () => {
  const { lyricsWindowBounds } = await load();
  assert.equal(typeof lyricsWindowBounds, 'function', 'missing display policy');
  const displays = [
    { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } },
    { id: 2, workArea: { x: -1280, y: 50, width: 1280, height: 720 } },
  ];
  const left = lyricsWindowBounds({ x: -1200, y: 800 }, displays, 1, 32);
  assert.equal(left.x, -1200);
  assert.ok(left.y + left.height <= 770);
  const removed = lyricsWindowBounds({ x: -1200, y: 800 }, [displays[0]], 1, 32);
  assert.equal(removed.x, 0);
  const tiny = lyricsWindowBounds({ x: Infinity, y: NaN }, [{ id: 3, workArea: { x: 0, y: 0, width: 480, height: 240 } }], 3, 64);
  assert.ok(tiny.width <= 480 && tiny.height <= 240 && tiny.x >= 0 && tiny.y >= 0);
  const centered = lyricsWindowBounds(null, displays, 1, 32);
  assert.equal(centered.x, 510);
  assert.ok(centered.y > 500);
  assert.throws(() => lyricsWindowBounds(null, [], 1, 32), /display/i);
});

test('rate limits bound bursts, refill monotonically and reset on document replacement', async () => {
  const { createLyricsRateLimit } = await load();
  assert.equal(typeof createLyricsRateLimit, 'function', 'missing rate limiter');
  let now = 1000;
  const limiter = createLyricsRateLimit(2, 3, () => now);
  assert.deepEqual([limiter.take(), limiter.take(), limiter.take(), limiter.take()], [true, true, true, false]);
  now = 1500;
  assert.equal(limiter.take(), true);
  assert.equal(limiter.take(), false);
  now = 0;
  assert.equal(limiter.take(), false);
  now = 1500;
  assert.equal(limiter.take(), false, 'clock rollback must not mint tokens twice');
  limiter.reset();
  assert.equal(limiter.take(), true);
});

test('resource policy permits exact local entry plus local scripts/styles only, never fetch/media/subframes/traversal', async () => {
  const { isLocalLyricsDocumentUrl, isAllowedLyricsResource } = await load();
  assert.equal(typeof isAllowedLyricsResource, 'function', 'missing resource boundary');
  const entry = 'file:///C:/app/desktop-lyrics.html';
  const root = 'file:///C:/app/';
  assert.equal(isLocalLyricsDocumentUrl(entry), true);
  assert.equal(isLocalLyricsDocumentUrl('http://127.0.0.1:5173/desktop-lyrics.html'), true);
  for (const bad of ['https://music.invalid/desktop-lyrics.html', 'file://server/share/lyrics.html', `${entry}#x`, 'http://user@localhost:5173/lyrics.html', 'http://localhost.evil/lyrics.html', 'data:text/html,local']) {
    assert.equal(isLocalLyricsDocumentUrl(bad), false, bad);
  }
  assert.equal(isAllowedLyricsResource({ url: entry, resourceType: 'mainFrame' }, entry, root), true);
  assert.equal(isAllowedLyricsResource({ url: `${root}assets/lyrics.js`, resourceType: 'script' }, entry, root), true);
  for (const request of [
    { url: entry, resourceType: 'subFrame' }, { url: entry, resourceType: 'xhr' },
    { url: `${root}assets/lyrics.js`, resourceType: 'media' },
    { url: 'file:///C:/private.json', resourceType: 'script' },
    { url: `${root}%2e%2e/private.js`, resourceType: 'script' },
    { url: 'https://invalid.test/x.js', resourceType: 'script' },
    { url: 'file:///C:/app-evil/x.js', resourceType: 'script' },
    { url: 'file://server/app/x.js', resourceType: 'script' },
  ]) assert.equal(isAllowedLyricsResource(request, entry, root), false, JSON.stringify(request));
});
