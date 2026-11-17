import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LyricsDoc, Track } from '../shared/types';
import type { DesktopLyricsPublication, DesktopLyricsPublisherApi, DesktopLyricsResult, DesktopLyricsState } from '../shared/desktop-lyrics';
import { createLyricsTimeline } from '../main/desktop-lyrics-model.mjs';
import { DESKTOP_LYRICS_LIMITS, sanitizeLyricsPreferences, validatePublication } from '../main/desktop-lyrics-policy.mjs';
import { connectDesktopLyricsPublisher, type DesktopLyricsPublisherConnection, type DesktopLyricsPublisherOptions } from './desktop-lyrics-publisher';

const ok = <T>(data: T): DesktopLyricsResult<T> => ({ ok: true, data });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function native() {
  const model = createLyricsTimeline(() => Date.now());
  const timeline = { ...model, snapshot: () => model.snapshot() as DesktopLyricsState['snapshot'] };
  const listeners = new Set<(state: DesktopLyricsState) => void>();
  const state = (): DesktopLyricsState => ({ snapshot: timeline.snapshot(),
    preferences: sanitizeLyricsPreferences(null), shown: false, persistence: 'saved', notice: null });
  const unsubscribe = vi.fn();
  const api = {
    state: vi.fn(async () => ok(state())),
    publish: vi.fn(async (value: DesktopLyricsPublication): Promise<DesktopLyricsResult> => {
      const result = timeline.accept(value);
      return result.ok ? ok(undefined) : { ok: false, error: {
        code: result.code === 'INVALID' ? 'INVALID' : 'STALE', message: 'Synthetic native rejection' } };
    }),
    updatePreferences: vi.fn(async () => ok(state())),
    onState: vi.fn((listener: (value: DesktopLyricsState) => void) => {
      listeners.add(listener);
      return () => { unsubscribe(); listeners.delete(listener); };
    }),
  } satisfies DesktopLyricsPublisherApi;
  return { api, state, timeline, unsubscribe, listeners,
    emit: (value = state()) => { for (const listener of listeners) listener(value); } };
}
function player() {
  const current: Track = { id: 'synthetic:track-1', title: 'Synthetic title', artists: [{ name: 'Synthetic artist' }],
    available: true, coverUrl: 'https://example.invalid/never-publish-cover' };
  const clock = { generation: 0, trackId: current.id as string | null,
    positionSeconds: 12.345, durationSeconds: 200, playing: false, playbackRate: 1.25,
    sampledAtMs: 1234 };
  return { current: current as Track | undefined, lyrics: null as LyricsDoc | null,
    position: 999, playing: true, readClock: vi.fn(() => clock), clock };
}
async function connect(options: DesktopLyricsPublisherOptions): Promise<DesktopLyricsPublisherConnection> {
  return connectDesktopLyricsPublisher(options);
}
const flush = async () => { for (let index = 0; index < 10; index++) await Promise.resolve(); };
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  try { expect(vi.getTimerCount(), 'every connection must release its heartbeat').toBe(0); }
  finally { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); }
});

describe('desktop lyrics publisher', () => {
  it.each(['getPlayer', 'readClock'] as const)('treats a transient %s exception as unavailable, not as a clear or a cached-clock substitute', async failing => {
    const host = native(); const live = player(); const onNotice = vi.fn(); let fail = false;
    const getPlayer = () => { if (fail && failing === 'getPlayer') throw new Error('Synthetic player-only detail'); return live; };
    const bridge = await connect({ api: host.api, getPlayer, onNotice }); await flush();
    fail = true;
    if (failing === 'readClock') live.readClock.mockImplementationOnce(() => { throw new Error('Synthetic clock-only detail'); });
    expect(() => bridge.pulse()).not.toThrow(); await flush();
    expect(host.api.publish).toHaveBeenCalledOnce(); expect(onNotice).toHaveBeenCalledOnce();
    expect(JSON.stringify(onNotice.mock.calls)).not.toMatch(/Synthetic (player|clock)-only detail/);
    fail = false; bridge.pulse(); await flush();
    expect(host.api.publish).toHaveBeenCalledTimes(2); bridge.stop();
  });

  it.each([-1, NaN, DESKTOP_LYRICS_LIMITS.positionMs + 1])('omits an invalid source line timestamp (%s) without hiding its safe future neighbor', async timeMs => {
    const host = native(); const live = player(); live.clock.positionSeconds = 1;
    live.lyrics = { synced: true, lines: [{ timeMs, text: 'Invalid source time must stay local' }, { timeMs: 10000, text: 'Safe future source' }] };
    const bridge = await connect({ api: host.api, getPlayer: () => live }); await flush();
    const value = host.api.publish.mock.calls[0][0];
    expect(value.current).toBeNull(); expect(value.next).toEqual({ timeMs: 10000, text: 'Safe future source' });
    expect(validatePublication(value)).not.toBeNull(); bridge.stop();
  });

  it('honors a native cleared generation across reconnect but permits the first later committed Audio token', async () => {
    const host = native(); const live = player(); const original = live.current;
    live.current = undefined; live.clock.trackId = null;
    const first = await connect({ api: host.api, getPlayer: () => live }); await flush(); first.stop();
    live.current = original; live.clock.trackId = original!.id;
    const second = await connect({ api: host.api, getPlayer: () => live }); await flush();
    await vi.advanceTimersByTimeAsync(200);
    expect(host.api.publish).toHaveBeenCalledOnce();
    live.clock.generation = 2; second.pulse(); await flush();
    expect(host.api.publish).toHaveBeenCalledTimes(2);
    expect(host.timeline.snapshot()).toMatchObject({ generation: 2, track: { key: 'g:2' } });
    second.stop();
  });

  it('keeps sequence ordering across a same-document disconnect and reconnect', async () => {
    const host = native(); const live = player();
    const first = await connect({ api: host.api, getPlayer: () => live }); await flush(); first.stop();
    live.clock.positionSeconds = 44;
    const second = await connect({ api: host.api, getPlayer: () => live }); await flush();
    expect(host.api.publish).toHaveBeenCalledTimes(2);
    expect(host.api.publish.mock.calls[1][0]).toMatchObject({ epoch: 1, generation: 0, sequence: 1 });
    expect(host.timeline.snapshot().anchor?.positionMs).toBe(44000);
    expect(host.api.state).toHaveBeenCalledTimes(2);
    second.stop(); expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['older state', 'older failure', 'older rejection'] as const)('does not overwrite a newer subscribed state with an %s read reply from the same epoch', async mode => {
    const host = native(); const live = player(); const onState = vi.fn(); const onNotice = vi.fn();
    const old = host.state(); const pending = deferred<DesktopLyricsResult<DesktopLyricsState>>(); host.api.state.mockReturnValueOnce(pending.promise);
    const bridge = await connect({ api: host.api, getPlayer: () => live, onState, onNotice });
    const newer = { ...host.state(), preferences: { ...host.state().preferences, visible: true } };
    host.emit(newer); await flush();
    if (mode === 'older state') pending.resolve(ok(old));
    else if (mode === 'older failure') pending.resolve({ ok: false, error: { code: 'WINDOW_FAILED', message: 'Obsolete read failure' } });
    else pending.reject(new Error('Obsolete read rejection'));
    await flush();
    expect(onState).toHaveBeenCalledExactlyOnceWith(newer); expect(onNotice).not.toHaveBeenCalled();
    expect(host.api.publish).toHaveBeenCalledOnce(); bridge.stop();
  });

  it('ignores late publish failures after a source changes or the bridge stops, retaining just the latest sample', async () => {
    const host = native(); const live = player(); const onNotice = vi.fn();
    const first = deferred<DesktopLyricsResult>(); const second = deferred<DesktopLyricsResult>();
    host.api.publish.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const bridge = await connect({ api: host.api, getPlayer: () => live, onNotice }); await flush();
    live.current = { id: 'synthetic:B', title: 'B', artists: [], available: true };
    live.clock.trackId = live.current.id; live.clock.generation = 2; bridge.pulse();
    first.resolve({ ok: false, error: { code: 'RATE_LIMITED', message: 'Obsolete source failure' } }); await flush();
    expect(onNotice).not.toHaveBeenCalled(); expect(host.api.publish).toHaveBeenCalledTimes(2);
    expect(host.api.publish.mock.calls[1][0]).toMatchObject({ generation: 2, sequence: 0, track: { key: 'g:2', title: 'B' } });
    bridge.pulse(); bridge.stop();
    second.resolve({ ok: false, error: { code: 'STALE', message: 'Stopped publication reply' } }); await flush();
    await vi.advanceTimersByTimeAsync(400);
    expect(host.api.publish).toHaveBeenCalledTimes(2); expect(host.api.state).toHaveBeenCalledOnce();
    expect(onNotice).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it('isolates observers even when native subscription immediately emits state and repeated notices', async () => {
    const host = native(); const live = player();
    const notice = { code: 'PERSISTENCE_WRITE_FAILED' as const, message: 'Synthetic saved-setting failure' };
    const state = { ...host.state(), notice };
    const subscribe = host.api.onState.getMockImplementation()!;
    host.api.onState.mockImplementation(listener => { const cleanup = subscribe(listener); listener(state); return cleanup; });
    const onState = vi.fn(() => { throw new Error('Synthetic state observer error'); });
    const onNotice = vi.fn(() => { throw new Error('Synthetic notice observer error'); });
    const bridge = await connect({ api: host.api, getPlayer: () => live, onState, onNotice }); await flush();
    host.emit(state); host.emit(state); await flush();
    expect(host.api.publish).toHaveBeenCalledOnce();
    expect(onNotice).toHaveBeenCalledExactlyOnceWith(notice);
    expect(onState).toHaveBeenCalled();
    bridge.stop(); expect(host.unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['typed failure', 'rejected promise'] as const)('recovers from an initial state %s on the bounded heartbeat without unhandled errors', async mode => {
    const host = native(); const live = player(); const onNotice = vi.fn();
    if (mode === 'typed failure') host.api.state.mockResolvedValueOnce({ ok: false, error: { code: 'RATE_LIMITED', message: 'Synthetic state limit' } });
    else host.api.state.mockRejectedValueOnce(new Error('Synthetic state exception must stay local'));
    const bridge = await connect({ api: host.api, getPlayer: () => live, onNotice }); await flush();
    expect(host.api.state).toHaveBeenCalledOnce(); expect(host.api.publish).not.toHaveBeenCalled();
    expect(onNotice).toHaveBeenCalledOnce();
    expect(JSON.stringify(onNotice.mock.calls)).not.toContain('Synthetic state exception');
    await vi.advanceTimersByTimeAsync(200);
    expect(host.api.state).toHaveBeenCalledTimes(2); expect(host.api.publish).toHaveBeenCalledOnce();
    bridge.stop();
  });

  it.each([
    { generation: -1 }, { generation: 0.5 }, { generation: Infinity },
    { positionSeconds: -1 }, { positionSeconds: NaN }, { positionSeconds: Infinity },
    { positionSeconds: DESKTOP_LYRICS_LIMITS.positionMs / 1000 + 1 },
    { playbackRate: 0 }, { playbackRate: 4.01 }, { playing: 'not a boolean' },
  ])('never publishes or repairs an invalid live clock %j', async bad => {
    const host = native(); const live = player(); const original = { ...live.clock };
    Object.assign(live.clock, bad);
    const bridge = await connect({ api: host.api, getPlayer: () => live }); await flush();
    expect(host.api.publish).not.toHaveBeenCalled();
    Object.assign(live.clock, original); bridge.pulse(); await flush();
    expect(host.api.publish).toHaveBeenCalledOnce();
    expect(host.api.publish.mock.calls[0][0].generation).toBe(0);
    bridge.stop();
  });

  it('pins source identity within a committed generation and rejects backwards generations', async () => {
    const host = native(); const live = player();
    const bridge = await connect({ api: host.api, getPlayer: () => live }); await flush();
    live.current = { id: 'synthetic:B', title: 'B', artists: [], available: true }; live.clock.trackId = live.current.id;
    bridge.pulse(); await flush();
    expect(host.api.publish).toHaveBeenCalledOnce();
    live.clock.generation = 2; bridge.pulse(); await flush();
    expect(host.api.publish).toHaveBeenCalledTimes(2);
    live.clock.generation = 1; bridge.pulse(); await flush();
    expect(host.api.publish).toHaveBeenCalledTimes(2);
    expect(host.timeline.snapshot().generation).toBe(2);
    bridge.stop();
  });

  it.each(['typed failure', 'rejected promise'] as const)('retries an unacknowledged clear after %s without leaking exceptions or retrying in a tight loop', async mode => {
    const host = native(); const live = player(); live.current = undefined; live.clock.trackId = null;
    const onNotice = vi.fn();
    if (mode === 'typed failure') host.api.publish.mockResolvedValueOnce({ ok: false, error: { code: 'RATE_LIMITED', message: 'Synthetic native limit' } });
    else host.api.publish.mockRejectedValueOnce(new Error('Synthetic exception payload must stay local'));
    const bridge = await connect({ api: host.api, getPlayer: () => live, onNotice }); await flush();
    expect(host.api.publish).toHaveBeenCalledOnce(); expect(onNotice).toHaveBeenCalledOnce();
    expect(JSON.stringify(onNotice.mock.calls)).not.toContain('Synthetic exception payload');
    await vi.advanceTimersByTimeAsync(200);
    expect(host.api.publish).toHaveBeenCalledTimes(2);
    expect(host.api.publish.mock.calls[1][0]).toMatchObject({ generation: 0, sequence: 1, track: null });
    await vi.advanceTimersByTimeAsync(600);
    expect(host.api.publish).toHaveBeenCalledTimes(2);
    expect(host.timeline.snapshot().track).toBeNull();
    bridge.stop();
  });

  it('bounds metadata and source fields before IPC while retaining safe adjacent source lines', async () => {
    const host = native(); const live = player(); live.clock.positionSeconds = 1;
    live.current!.title = '\u0000' + 't'.repeat(300);
    live.current!.artists = [{ name: 'a'.repeat(300) }];
    live.lyrics = { synced: true, lines: [
      { timeMs: 0, text: 'x'.repeat(DESKTOP_LYRICS_LIMITS.text + 1) },
      { timeMs: 10000, text: 'a'.repeat(129), translation: 'x'.repeat(DESKTOP_LYRICS_LIMITS.text + 1),
        segments: Array.from({ length: 129 }, () => ({ timeMs: 10000, text: 'a' })) },
    ] };
    const bridge = await connect({ api: host.api, getPlayer: () => live }); await flush();
    const value = host.api.publish.mock.calls[0][0];
    expect(value.track!.title.length).toBeLessThanOrEqual(DESKTOP_LYRICS_LIMITS.metadata);
    expect(value.track!.artist.length).toBeLessThanOrEqual(DESKTOP_LYRICS_LIMITS.metadata);
    expect(value.current).toBeNull();
    expect(value.next).toEqual({ timeMs: 10000, text: 'a'.repeat(129) });
    expect(validatePublication(value)).not.toBeNull();
    bridge.stop();
  });

  it('fits the 32KiB UTF-8 wire budget by omitting word marks, never truncating their source text', async () => {
    const host = native(); const live = player(); live.clock.positionSeconds = 1.5;
    const text = '合'.repeat(DESKTOP_LYRICS_LIMITS.text);
    const line = (timeMs: number) => ({ timeMs, text, translation: text,
      segments: Array.from({ length: 128 }, (_, index) => ({ timeMs: timeMs + index * 10, text: '合'.repeat(16) })) });
    live.lyrics = { synced: true, lines: [line(0), line(10000)] };
    const bridge = await connect({ api: host.api, getPlayer: () => live }); await flush();
    const value = host.api.publish.mock.calls[0][0];
    expect(new TextEncoder().encode(JSON.stringify(value)).length).toBeLessThanOrEqual(DESKTOP_LYRICS_LIMITS.publicationBytes);
    expect(value.current).toEqual({ timeMs: 0, text, translation: text });
    expect(value.next).toEqual({ timeMs: 10000, text, translation: text });
    expect(validatePublication(value)).not.toBeNull();
    bridge.stop();
  });

  it.each([
    ['partial text', [{ timeMs: 1000, text: 'a' }]],
    ['backwards marks', [{ timeMs: 1800, text: 'a' }, { timeMs: 1200, text: 'b' }]],
    ['before line start', [{ timeMs: 999, text: 'a' }, { timeMs: 1200, text: 'b' }]],
    ['overlaps next line', [{ timeMs: 1000, text: 'a' }, { timeMs: 2000, text: 'b' }]],
    ['non-finite marks', [{ timeMs: 1000, text: 'a' }, { timeMs: NaN, text: 'b' }]],
  ] as const)('omits unsafe source word marks (%s) without manufacturing replacements', async (_label, segments) => {
    const host = native(); const live = player(); live.clock.positionSeconds = 1.5;
    live.lyrics = { synced: true, lines: [{ timeMs: 1000, text: 'ab', segments: segments.map(value => ({ ...value })) },
      { timeMs: 2000, text: 'Next real source line' }] };
    const bridge = await connect({ api: host.api, getPlayer: () => live }); await flush();
    const value = host.api.publish.mock.calls[0][0];
    expect(value.current).toEqual({ timeMs: 1000, text: 'ab' });
    expect(validatePublication(value)).not.toBeNull();
    bridge.stop();
  });

  it('publishes a bounded untimed source pair without inventing line or word timing', async () => {
    const host = native(); const live = player();
    live.lyrics = { synced: false, lines: [
      { timeMs: null, text: 'Untimed current source' }, { timeMs: null, text: 'Untimed next source' },
      { timeMs: null, text: 'Do not publish the third source line' },
    ] };
    const bridge = await connect({ api: host.api, getPlayer: () => live }); await flush();
    expect(host.api.publish.mock.calls[0][0]).toMatchObject({ current: { timeMs: null, text: 'Untimed current source' },
      next: { timeMs: null, text: 'Untimed next source' } });
    expect(Object.keys(host.api.publish.mock.calls[0][0].current!)).toEqual(['timeMs', 'text']);
    bridge.stop();
  });

  it('finds an already-playing source in the queue without attributing the pending selection lyrics to it', async () => {
    const host = native(); const fixture = player(); const original = fixture.current!;
    const second: Track = { id: 'synthetic:B', title: 'Selected B', artists: [], available: true };
    const live = { ...fixture, current: second, queue: [original, second],
      lyrics: { synced: true, lines: [{ timeMs: 0, text: 'Pending B must not be attributed to A' }] } };
    const bridge = await connect({ api: host.api, getPlayer: () => live }); await flush();
    expect(host.api.publish).toHaveBeenCalledOnce();
    expect(host.api.publish.mock.calls[0][0]).toMatchObject({ track: { title: original.title }, current: null, next: null });
    live.clock.trackId = 'not-in-the-synthetic-queue'; live.clock.generation = 1;
    bridge.pulse(); await flush();
    expect(host.api.publish).toHaveBeenCalledOnce();
    bridge.stop();
  });

  it('refreshes a stale epoch once and waits for that state read before resampling', async () => {
    const host = native(); const live = player();
    const bridge = await connect({ api: host.api, getPlayer: () => live }); await flush();
    host.timeline.reset();
    const refreshed = deferred<DesktopLyricsResult<DesktopLyricsState>>();
    host.api.state.mockReturnValueOnce(refreshed.promise);
    bridge.pulse(); await flush();
    expect(host.api.state).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(host.api.publish).toHaveBeenCalledTimes(2);
    expect(host.api.state).toHaveBeenCalledTimes(2);
    live.clock.positionSeconds = 48;
    refreshed.resolve(ok(host.state())); await flush();
    expect(host.api.publish).toHaveBeenCalledTimes(3);
    expect(host.api.publish.mock.calls[2][0]).toMatchObject({ epoch: 2, generation: 0, sequence: 0, clock: { positionMs: 48000 } });
    expect(host.timeline.snapshot().anchor?.positionMs).toBe(48000);
    bridge.stop();
  });

  it('resets ordering for a new document epoch without overlapping or applying a late old-epoch reply', async () => {
    const host = native(); const live = player(); const onNotice = vi.fn();
    live.clock.generation = 7;
    const pending = deferred<DesktopLyricsResult>(); host.api.publish.mockReturnValueOnce(pending.promise);
    const bridge = await connect({ api: host.api, getPlayer: () => live, onNotice }); await flush();
    host.timeline.reset(); live.clock.generation = 0; host.emit();
    await flush(); expect(host.api.publish).toHaveBeenCalledOnce();
    pending.resolve({ ok: false, error: { code: 'STALE', message: 'Old document was reset' } }); await flush();
    expect(host.api.publish).toHaveBeenCalledTimes(2);
    expect(host.api.publish.mock.calls[1][0]).toMatchObject({ epoch: 2, generation: 0, sequence: 0 });
    expect(host.timeline.snapshot().generation).toBe(0);
    expect(host.api.state).toHaveBeenCalledOnce(); expect(onNotice).not.toHaveBeenCalled();
    bridge.stop();
  });

  it('ignores an older initial state reply after a newer subscription epoch has arrived', async () => {
    const host = native(); const live = player(); const onState = vi.fn();
    const old = host.state(); const initial = deferred<DesktopLyricsResult<DesktopLyricsState>>();
    host.api.state.mockReturnValueOnce(initial.promise);
    const bridge = await connect({ api: host.api, getPlayer: () => live, onState });
    host.timeline.reset(); host.emit(); await flush();
    initial.resolve(ok(old)); await flush();
    expect(host.api.publish.mock.calls.map(([value]) => value.epoch)).toEqual([2]);
    expect(onState).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ snapshot: expect.objectContaining({ epoch: 2 }) }));
    bridge.stop();
  });

  it('stops idempotently and ignores a late state read or detached subscription callback', async () => {
    const host = native(); const live = player(); const onState = vi.fn(); const onNotice = vi.fn();
    const initial = deferred<DesktopLyricsResult<DesktopLyricsState>>();
    host.api.state.mockReturnValueOnce(initial.promise);
    const getPlayer = vi.fn(() => live);
    const bridge = await connect({ api: host.api, getPlayer, onState, onNotice });
    const listener = host.api.onState.mock.calls[0][0];
    bridge.stop(); bridge.stop();
    initial.resolve(ok(host.state())); listener(host.state()); bridge.pulse();
    await vi.advanceTimersByTimeAsync(2000); await flush();
    expect(host.unsubscribe).toHaveBeenCalledOnce();
    expect(host.listeners.size).toBe(0);
    expect(host.api.publish).not.toHaveBeenCalled();
    expect(onState).not.toHaveBeenCalled(); expect(onNotice).not.toHaveBeenCalled();
    expect(getPlayer).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not rebind a carried old lyric document to the newly committed source', async () => {
    const host = native(); const live = player();
    live.lyrics = { synced: true, lines: [{ timeMs: 0, text: 'Known words for source A' }] };
    const bridge = await connect({ api: host.api, getPlayer: () => live }); await flush();
    live.current = { id: 'synthetic:B', title: 'Source B', artists: [], available: true };
    bridge.pulse(); await flush();
    live.clock.generation = 2; live.clock.trackId = live.current.id;
    bridge.pulse(); await flush();
    expect(host.api.publish.mock.calls[2][0]).toMatchObject({ track: { title: 'Source B' }, current: null, next: null });
    live.lyrics = null; bridge.pulse(); await flush();
    live.lyrics = { synced: true, lines: [{ timeMs: 0, text: 'New source B document' }] };
    bridge.pulse(); await flush();
    expect(host.api.publish.mock.calls[4][0].current?.text).toBe('New source B document');
    bridge.stop();
  });

  it('keeps the committed source metadata and lyrics while another React track is pending', async () => {
    const host = native(); const live = player();
    live.lyrics = { synced: true, lines: [{ timeMs: 0, text: 'Words for source A' }] };
    const bridge = await connect({ api: host.api, getPlayer: () => live });
    await flush();
    const second: Track = { id: 'opaque source B/不修复?not-wire-safe', title: 'Pending source B', artists: [], available: true };
    live.current = second;
    live.lyrics = { synced: true, lines: [{ timeMs: 0, text: 'Words for source B' }] };
    live.clock.positionSeconds = 13; live.clock.playing = true;
    bridge.pulse(); await flush();
    expect(host.api.publish).toHaveBeenCalledTimes(2);
    expect(host.api.publish.mock.calls[1][0]).toMatchObject({ generation: 0,
      track: { key: 'g:0', title: 'Synthetic title' }, clock: { positionMs: 13000, playing: true },
      current: { text: 'Words for source A' } });
    live.clock.generation = 2; live.clock.trackId = second.id; live.clock.positionSeconds = 0;
    bridge.pulse(); await flush();
    expect(host.api.publish.mock.calls[2][0]).toMatchObject({ generation: 2, sequence: 0,
      track: { key: 'g:2', title: 'Pending source B' }, current: { text: 'Words for source B' } });
    expect(JSON.stringify(host.api.publish.mock.calls)).not.toContain(second.id);
    bridge.stop();
  });

  it('clears once only when the current track is absent and never resurrects its cleared generation', async () => {
    const host = native(); const live = player(); const original = live.current;
    const bridge = await connect({ api: host.api, getPlayer: () => live });
    await flush();
    live.current = undefined; live.clock.trackId = null;
    bridge.pulse(); await flush();
    expect(host.api.publish).toHaveBeenCalledTimes(2);
    expect(host.api.publish.mock.calls[1][0]).toEqual({ epoch: 1, generation: 0, sequence: 1,
      track: null, clock: null, current: null, next: null });
    for (let index = 0; index < 4; index++) { bridge.pulse(); await flush(); }
    await vi.advanceTimersByTimeAsync(400);
    expect(host.api.publish).toHaveBeenCalledTimes(2);
    live.current = original; live.clock.trackId = original!.id;
    bridge.pulse(); await flush();
    expect(host.api.publish).toHaveBeenCalledTimes(2);
    live.clock.generation = 1;
    bridge.pulse(); await flush();
    expect(host.api.publish).toHaveBeenCalledTimes(3);
    expect(host.timeline.snapshot().track?.key).toBe('g:1');
    expect(host.api.publish.mock.calls[2][0]).toMatchObject({ generation: 1, sequence: 0 });
    bridge.stop();
  });

  it('forwards native state without turning publication echoes into a publish feedback loop', async () => {
    const host = native(); const live = player(); const onState = vi.fn();
    const bridge = await connect({ api: host.api, getPlayer: () => live, onState });
    await flush();
    for (let index = 0; index < 6; index++) { host.emit(); await flush(); }
    expect(onState).toHaveBeenCalledTimes(7);
    expect(onState).toHaveBeenLastCalledWith(host.state());
    expect(host.api.publish).toHaveBeenCalledOnce();
    bridge.stop();
  });

  it('keeps one publish in flight and coalesces pulses to a fresh clock instead of building a backlog', async () => {
    const host = native(); const live = player();
    const first = deferred<DesktopLyricsResult>();
    host.api.publish.mockReturnValueOnce(first.promise);
    const bridge = await connect({ api: host.api, getPlayer: () => live });
    await flush();
    for (let index = 0; index < 50; index++) { live.clock.positionSeconds = index; bridge.pulse(); }
    await vi.advanceTimersByTimeAsync(1000);
    expect(host.api.publish).toHaveBeenCalledOnce();
    live.clock.positionSeconds = 89;
    first.resolve(ok(undefined));
    await flush();
    expect(host.api.publish).toHaveBeenCalledTimes(2);
    expect(host.api.publish.mock.calls[1][0]).toMatchObject({ sequence: 1, clock: { positionMs: 89000 } });
    await flush();
    expect(host.api.publish).toHaveBeenCalledTimes(2);
    bridge.stop();
  });

  it('samples the latest live clock every 200ms and immediately on pulse, including paused seeks', async () => {
    const host = native(); let latest = player();
    const bridge = await connect({ api: host.api, getPlayer: () => latest });
    await flush();
    await vi.advanceTimersByTimeAsync(199);
    expect(host.api.publish).toHaveBeenCalledOnce();
    latest.clock.positionSeconds = 3.5;
    await vi.advanceTimersByTimeAsync(1);
    expect(host.api.publish).toHaveBeenCalledTimes(2);
    expect(host.api.publish.mock.calls[1][0].clock).toEqual({ positionMs: 3500, playing: false, rate: 1.25 });
    const replacement = player(); replacement.clock.generation = 1;
    replacement.clock.positionSeconds = 21; replacement.clock.playing = true;
    latest = replacement;
    bridge.pulse();
    await flush();
    expect(host.api.publish).toHaveBeenCalledTimes(3);
    expect(host.api.publish.mock.calls[2][0]).toMatchObject({ generation: 1, clock: { positionMs: 21000, playing: true } });
    expect(replacement.readClock).toHaveBeenCalledOnce();
    bridge.stop();
  });

  it('waits for native state and publishes generation zero from the live clock, never cached UI progress', async () => {
    const host = native(); const live = player();
    const initial = deferred<DesktopLyricsResult<DesktopLyricsState>>();
    host.api.state.mockReturnValueOnce(initial.promise);
    const bridge = await connect({ api: host.api, getPlayer: () => live });
    expect(host.api.onState).toHaveBeenCalledOnce();
    expect(host.api.state).toHaveBeenCalledOnce();
    expect(host.api.publish).not.toHaveBeenCalled();
    initial.resolve(ok(host.state()));
    await flush();
    expect(host.api.publish).toHaveBeenCalledOnce();
    expect(host.api.publish.mock.calls[0][0]).toEqual({ epoch: 1, generation: 0, sequence: 0,
      track: { key: 'g:0', title: 'Synthetic title', artist: 'Synthetic artist' },
      clock: { positionMs: 12345, playing: false, rate: 1.25 }, current: null, next: null });
    expect(live.readClock).toHaveBeenCalled();
    expect(host.timeline.snapshot().track?.key).toBe('g:0');
    bridge.stop();
  });

  it('projects only the current and next source lines with source word marks and present optional fields', async () => {
    const host = native(); const live = player();
    live.lyrics = { synced: true, source: 'local', matchedTitle: 'never-publish-document-metadata', lines: [
      { timeMs: 1000, text: 'Earlier synthetic line' },
      Object.assign({ timeMs: 10000, text: 'Source words', translation: 'Synthetic translation',
        segments: [{ timeMs: 10000, text: 'Source ' }, { timeMs: 11000, text: 'words' }] }, { raw: { syntheticPrivate: true } }),
      { timeMs: 20000, text: 'Next synthetic line' },
      { timeMs: 30000, text: 'Never send the entire document' },
    ] };

    const bridge = await connect({ api: host.api, getPlayer: () => live });
    await flush();
    const value = host.api.publish.mock.calls[0][0];
    expect(value.current).toEqual({ timeMs: 10000, text: 'Source words', translation: 'Synthetic translation',
      segments: [{ timeMs: 10000, text: 'Source ' }, { timeMs: 11000, text: 'words' }] });
    expect(value.next).toEqual({ timeMs: 20000, text: 'Next synthetic line' });
    expect(Object.keys(value.next!)).toEqual(['timeMs', 'text']);
    expect(host.timeline.snapshot().current).toEqual(value.current);
    expect(JSON.stringify(value)).not.toMatch(/never-publish|raw|syntheticPrivate|Earlier|entire document|synthetic:track/);
    live.lyrics.lines[1].segments![0].text = 'mutated after send';
    expect(value.current!.segments![0].text).toBe('Source ');
    bridge.stop();
  });
});
