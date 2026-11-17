import test from 'node:test';
import assert from 'node:assert/strict';
const load = () => import('../src/main/desktop-lyrics-model.mjs').catch(() => ({}));
const publication = (extra = {}) => ({
  epoch: 1, generation: 7, sequence: 1,
  track: { key: 'track-7', title: '测试歌曲', artist: '测试歌手' },
  clock: { positionMs: 1200, playing: true, rate: 1 },
  current: { timeMs: 1000, text: '你好', segments: [{ timeMs: 1000, text: '你' }, { timeMs: 1500, text: '好' }] },
  next: { timeMs: 3000, text: '下一行' }, ...extra,
});

test('main receipt clock rejects stale generations/sequences and track identity changes', async () => {
  const { createLyricsTimeline } = await load();
  assert.equal(typeof createLyricsTimeline, 'function', 'missing timeline');
  let now = 100;
  const timeline = createLyricsTimeline(() => now);
  assert.equal(timeline.accept(publication()).ok, true);
  assert.equal(timeline.snapshot().anchor.receivedAtMs, 100);
  now = 900;
  assert.equal(timeline.accept(publication()).code, 'STALE');
  assert.equal(timeline.accept(publication({ generation: 6, sequence: 99 })).code, 'STALE');
  assert.equal(timeline.accept(publication({ sequence: 2, track: { key: 'other', title: 'wrong', artist: '' } })).code, 'STALE');
  assert.equal(timeline.accept(publication({ sequence: 2, clock: { positionMs: 200, playing: false, rate: 1 } })).ok, true);
  assert.equal(timeline.snapshot().anchor.positionMs, 200);
  assert.equal(timeline.snapshot().anchor.playing, false);
  assert.equal(timeline.snapshot().anchor.receivedAtMs, 900);
});

test('track clear erases text immediately, forbids resurrection, reset accepts a new document generation zero', async () => {
  const { createLyricsTimeline } = await load();
  const timeline = createLyricsTimeline(() => 50);
  timeline.accept(publication());
  const clear = publication({ sequence: 2, track: null, clock: null, current: null, next: null });
  assert.equal(timeline.accept(clear).ok, true, 'clearing same Audio generation must succeed');
  assert.equal(timeline.snapshot().track, null);
  assert.equal(timeline.snapshot().anchor, null);
  assert.equal(timeline.accept(publication({ sequence: 3 })).code, 'STALE');
  assert.equal(timeline.accept(publication({ generation: 8 })).ok, true);
  const epoch = timeline.reset();
  assert.equal(epoch, 2);
  assert.equal(timeline.snapshot().generation, null);
  assert.equal(timeline.snapshot().current, null);
  assert.equal(timeline.accept(publication({ sequence: 99 })).code, 'STALE');
  assert.equal(timeline.accept(publication({ epoch, generation: 0 })).ok, true);
});

test('display uses received anchors, exact source word boundaries, pause/seek and capped stale extrapolation', async () => {
  const { createLyricsTimeline, projectLyricsDisplay } = await load();
  assert.equal(typeof projectLyricsDisplay, 'function', 'missing display interpolation');
  const timeline = createLyricsTimeline(() => 1000);
  timeline.accept(publication());
  const snapshot = timeline.snapshot();
  assert.equal(projectLyricsDisplay(snapshot, 1000).positionMs, 1200);
  assert.equal(projectLyricsDisplay(snapshot, 1299).activeWord, 0);
  assert.equal(projectLyricsDisplay(snapshot, 1300).activeWord, 1);
  assert.equal(projectLyricsDisplay(snapshot, 999999).positionMs, 2700);
  assert.equal(projectLyricsDisplay(snapshot, 999999).stale, true);
  assert.equal(projectLyricsDisplay(snapshot, 900).positionMs, 1200);
  timeline.accept(publication({ sequence: 2, clock: { positionMs: 900, playing: false, rate: 2 } }));
  assert.equal(projectLyricsDisplay(timeline.snapshot(), 999999).positionMs, 900);
  assert.equal(projectLyricsDisplay(timeline.snapshot(), 999999).activeWord, -1);
  assert.equal(projectLyricsDisplay(timeline.snapshot(), 999999).stale, false);
  timeline.accept(publication({ sequence: 3, clock: { positionMs: 2500, playing: true, rate: 2 } }));
  assert.equal(projectLyricsDisplay(timeline.snapshot(), 1250).current.text, '下一行');
  assert.equal(projectLyricsDisplay(timeline.snapshot(), 1250).activeWord, -1);
  const untimed = { ...snapshot, current: { timeMs: 0, text: '没有词时间' }, next: null };
  assert.equal(projectLyricsDisplay(untimed, 1100).activeWord, -1);
  const partlyTimed = { ...snapshot, current: { timeMs: 0, text: '你好', segments: [{ timeMs: 0, text: '你' }, { timeMs: null, text: '好' }] } };
  assert.equal(projectLyricsDisplay(partlyTimed, 1100).activeWord, -1);
});
