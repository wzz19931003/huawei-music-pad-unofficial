import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Playback, Track } from '../../shared/types';

// A deterministic hook host supplies only React scheduling and native Audio/IPC
// stand-ins. The production hook and pure playback policy run unchanged. The
// separate Electron acceptance exercises real React and real native Audio.
const host = vi.hoisted(() => ({ slots: [] as any[], effects: [] as any[], cursor: 0, dirty: false }));
vi.mock('react', () => ({
  useState(initial: any) {
    const slot = host.cursor++;
    if (!(slot in host.slots)) host.slots[slot] = initial;
    return [host.slots[slot], (next: any) => {
      const value = typeof next === 'function' ? next(host.slots[slot]) : next;
      if (!Object.is(value, host.slots[slot])) { host.slots[slot] = value; host.dirty = true; }
    }];
  },
  useRef(initial: any) { const slot = host.cursor++; return host.slots[slot] ??= { current: initial }; },
  useCallback(fn: any, deps: any[]) {
    const slot = host.cursor++;
    const previous = host.slots[slot];
    if (previous && deps.every((dep, index) => Object.is(dep, previous.deps[index]))) return previous.fn;
    host.slots[slot] = { deps, fn }; return fn;
  },
  useEffect(fn: any, deps: any[]) {
    const slot = host.cursor++;
    const previous = host.slots[slot];
    if (previous && deps.every((dep, index) => Object.is(dep, previous.deps[index]))) return;
    host.effects.push(() => { previous?.cleanup?.(); host.slots[slot] = { deps, cleanup: fn() }; });
  },
}));
const ipc = vi.hoisted(() => ({
  resolvePlayback: vi.fn(), lyrics: vi.fn(), favoriteState: vi.fn(), setFavorite: vi.fn(), search: vi.fn(),
}));
vi.mock('./api', () => ({ api: ipc }));
import { usePlayer } from './player';

class TestAudio extends EventTarget {
  static instances: TestAudio[] = [];
  preload = ''; volume = 0; src = ''; currentTime = 0; duration = 60; readyState = 1; paused = true;
  constructor() { super(); TestAudio.instances.push(this); }
  async play() { this.paused = false; this.dispatchEvent(new Event('playing')); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
}
const track = (id: string): Track => ({ id, title: `Synthetic ${id}`, artists: [{ id: 'seed-artist', name: 'Synthetic artist' }], available: true });
const options = () => ({ quality: 'standard' as const, volume: 0, accountKey: 'synthetic-account' as string | null, onError: vi.fn(), onVolumeCommit: vi.fn(), onPreferencesChange: vi.fn() });
let config: ReturnType<typeof options>;
let player: ReturnType<typeof usePlayer>;
function render() {
  for (let turns = 0; turns < 40; turns++) {
    host.dirty = false; host.cursor = 0; player = usePlayer(config);
    host.effects.splice(0).forEach(effect => effect());
    if (!host.dirty) return;
  }
  throw new Error('hook host failed to settle');
}
async function act(fn: () => unknown = () => undefined) {
  fn();
  for (let turn = 0; turn < 12; turn++) { if (host.dirty) render(); await Promise.resolve(); }
  if (host.dirty) render();
}
const audio = () => TestAudio.instances[0];
beforeEach(() => {
  host.slots = []; host.effects = []; host.cursor = 0; host.dirty = false;
  TestAudio.instances = [];
  vi.stubGlobal('Audio', TestAudio);
  vi.stubGlobal('window', { setTimeout, clearTimeout, desktop: { music: { favorites: vi.fn(), artist: vi.fn() } } });
  vi.clearAllMocks();
  ipc.resolvePlayback.mockResolvedValue({ url: 'blob:synthetic-unit-audio', actualQuality: 'standard' } satisfies Playback);
  ipc.lyrics.mockResolvedValue({ synced: false, lines: [] });
  ipc.favoriteState.mockResolvedValue(false);
  config = options(); render();
});
afterEach(() => { host.slots.forEach(slot => slot?.cleanup?.()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('singleton player mode integration', () => {
  it('rejects an incomplete favorites snapshot at the page budget instead of calling already-saved tracks new', async () => {
    vi.mocked(window.desktop.music.favorites).mockImplementation(async ({ start = 0 } = {}) => ({ ok: true, data: {
      tracks: Array.from({ length: 50 }, (_, index) => track(`saved-${start + index}`)), nextStart: start + 50, hasMore: true,
    } }));
    vi.mocked(window.desktop.music.artist).mockResolvedValue({ ok: true, data: { artist: { id: 'seed-artist', name: 'Synthetic artist' }, tracks: [track('candidate')], albums: [] } });
    ipc.search.mockResolvedValue({ tracks: [], nextStart: 0, hasMore: false });
    await act(() => player.playFrom([track('keep')], 0));
    let pending!: Promise<boolean>;
    await act(() => { pending = player.selectMode('heart'); });
    expect(await pending).toBe(false);
    await act();
    expect(window.desktop.music.favorites).toHaveBeenCalledTimes(16);
    expect(window.desktop.music.artist).not.toHaveBeenCalled();
    expect(player.mode).toBe('all');
    expect(player.queue.map(row => row.id)).toEqual(['keep']);
    expect(player.heartStatus).toBe('error');
  });
  it('defaults to list and explicitly replays a one-track queue on manual next and ended', async () => {
    expect(player.mode).toBe('all');
    await act(() => player.playFrom([track('solo')], 0));
    expect(ipc.resolvePlayback).toHaveBeenCalledTimes(1);
    await act(() => player.next());
    expect(ipc.resolvePlayback).toHaveBeenCalledTimes(2);
    await act(() => audio().dispatchEvent(new Event('ended')));
    expect(ipc.resolvePlayback).toHaveBeenCalledTimes(3);
    expect(TestAudio.instances).toHaveLength(1);
  });
  it('uses single repeat only for automatic ended and advances rapid manual calls synchronously', async () => {
    await act(() => { player.playFrom(['a', 'b', 'c'].map(track), 0); player.setPreferences('one'); });
    await act(() => audio().dispatchEvent(new Event('ended')));
    expect(player.index).toBe(0);
    expect(ipc.resolvePlayback).toHaveBeenCalledTimes(2);
    await act(() => { player.next(); player.next(); });
    expect(player.index).toBe(2);
    await act(() => player.next());
    expect(player.index).toBe(0);
  });
  it('resets both random bag and history on direct selection, replacement and every queue mutation', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const rows = ['a', 'b', 'c', 'd'].map(track);
    const mutations = [
      () => player.jumpTo(player.index),
      () => player.enqueueNext([track('e')]),
      () => player.enqueueLast([track('e')]),
      () => player.removeAt(3),
      () => player.clearUpcoming(),
      () => player.playFrom(rows, 2),
      () => player.restore(rows, 2, 0),
    ];
    for (const mutate of mutations) {
      await act(() => { player.playFrom(rows, 0); player.setPreferences('shuffle'); });
      await act(() => player.next());
      expect(player.index).toBe(2);
      await act(mutate);
      await act(() => player.previous());
      expect(player.index).toBe(1);
      const visited = [player.index];
      for (let i = 1; i < player.queue.length; i++) { await act(() => player.next()); visited.push(player.index); }
      expect(new Set(visited).size).toBe(player.queue.length);
    }
  });
  it('updates previous index before another action in the same frame', async () => {
    await act(() => player.playFrom(['a', 'b', 'c'].map(track), 2));
    await act(() => { player.previous(); player.next(); });
    expect(player.index).toBe(2);
  });
  it('collects bounded favorite pages and atomically selects a real alternating heart queue', async () => {
    const favorites = Array.from({ length: 51 }, (_, index) => track(`saved-${index}`));
    const fresh = track('new-related');
    vi.mocked(window.desktop.music.favorites).mockImplementation(async ({ start = 0 } = {}) => ({ ok: true, data: {
      tracks: favorites.slice(start, start + 50), nextStart: Math.min(start + 50, favorites.length), hasMore: start === 0,
    } }));
    vi.mocked(window.desktop.music.artist).mockResolvedValue({ ok: true, data: { artist: { id: 'seed-artist', name: 'Synthetic artist' }, tracks: [favorites[50], fresh], albums: [] } });
    ipc.search.mockResolvedValue({ tracks: [], nextStart: 0, hasMore: false });
    await act(() => player.playFrom([track('old-queue')], 0));
    let selected: Promise<boolean>;
    await act(() => { selected = player.selectMode('heart'); });
    expect(await selected!).toBe(true);
    await act();
    expect(player.mode).toBe('heart');
    expect(player.queue.map(row => row.id)).toEqual(['saved-0', 'new-related']);
    expect(window.desktop.music.favorites).toHaveBeenCalledTimes(2);
    expect(window.desktop.music.artist).toHaveBeenCalledWith({ id: 'seed-artist' });
    expect(config.onPreferencesChange).toHaveBeenCalledExactlyOnceWith('heart');
    expect(player.heartStatus).toBe('ready');
  });
  it('discards late heart IPC after a mode change without changing the current queue', async () => {
    vi.mocked(window.desktop.music.favorites).mockResolvedValue({ ok: true, data: { tracks: [track('saved')], nextStart: 1, hasMore: false } });
    let finish!: (response: any) => void;
    vi.mocked(window.desktop.music.artist).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await act(() => player.playFrom([track('keep')], 0));
    let pending!: Promise<boolean>;
    await act(() => { pending = player.selectMode('heart'); });
    expect(player.heartStatus).toBe('loading');
    await act(() => player.selectMode('shuffle'));
    await act(() => finish({ ok: true, data: { tracks: [track('late-new')] } }));
    expect(await pending).toBe(false);
    await act();
    expect(player.mode).toBe('shuffle');
    expect(player.queue.map(row => row.id)).toEqual(['keep']);
    expect(config.onPreferencesChange).toHaveBeenCalledExactlyOnceWith('shuffle');
  });
  it.each(['account', 'logout', 'unmount', 'replace'] as const)('discards late favorite pagination on %s', async boundary => {
    let finish!: (response: any) => void;
    vi.mocked(window.desktop.music.favorites).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    vi.mocked(window.desktop.music.artist).mockResolvedValue({ ok: true, data: { artist: { id: 'seed-artist', name: 'Synthetic artist' }, tracks: [track('new-related')], albums: [] } });
    await act(() => player.playFrom([track('keep')], 0));
    let pending!: Promise<boolean>;
    await act(() => { pending = player.selectMode('heart'); });
    if (boundary === 'account') { config.accountKey = 'other-synthetic-account'; render(); }
    if (boundary === 'logout') await act(() => player.cancelHeart());
    if (boundary === 'unmount') host.slots.forEach(slot => slot?.cleanup?.());
    if (boundary === 'replace') await act(() => player.playFrom([track('replacement')], 0));
    await act(() => finish({ ok: true, data: { tracks: [track('saved')], nextStart: 1, hasMore: false } }));
    expect(await pending).toBe(false);
    expect(window.desktop.music.artist).not.toHaveBeenCalled();
    expect(config.onPreferencesChange).not.toHaveBeenCalled();
    if (boundary !== 'unmount') expect(player.heartStatus).toBe('cancelled');
  });
  it('clears old quality immediately and commits evidence only for the latest playback load', async () => {
    const evidence = { codec: 'flac', qualityEvidence: 'media-bytes', sampleRateHz: 96000, bitDepth: 24, channels: 2, contentType: 'audio/flac' } as const;
    ipc.resolvePlayback.mockResolvedValueOnce({ url: 'blob:synthetic-old', actualQuality: 'lossless', ...evidence });
    await act(() => player.playFrom(['a', 'b', 'c'].map(track), 0));
    expect(player.playbackDetails).toEqual(evidence);
    expect(player.playbackDetails).not.toHaveProperty('url');
    const finish: ((value: any) => void)[] = [];
    ipc.resolvePlayback.mockImplementation(() => new Promise(resolve => { finish.push(resolve); }));
    await act(() => player.next());
    expect(player.playbackDetails).toBeNull();
    expect(player.actualQuality).toBe('unknown');
    await act(() => player.next());
    await act(() => finish[0]({ url: 'blob:synthetic-stale', actualQuality: 'lossless', ...evidence }));
    expect(player.playbackDetails).toBeNull();
    await act(() => finish[1]({ url: 'blob:synthetic-latest', actualQuality: 'standard', codec: 'mp3', qualityEvidence: 'provider' }));
    expect(player.playbackDetails).toMatchObject({ codec: 'mp3', qualityEvidence: 'provider' });
    expect(player.actualQuality).toBe('standard');
  });
  it('invalidates a pending playback result when the queue is emptied', async () => {
    let finish!: (value: any) => void;
    ipc.resolvePlayback.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await act(() => player.playFrom([track('pending')], 0));
    await act(() => player.removeAt(0));
    await act(() => finish({ url: 'blob:synthetic-late', actualQuality: 'lossless', codec: 'flac', qualityEvidence: 'provider' }));
    expect(player.current).toBeUndefined();
    expect(audio().src).toBe('');
    expect(player.playbackDetails).toBeNull();
    expect(player.actualQuality).toBe('unknown');
  });
  it('does not start a favorites IPC when heart is cancelled in the same frame', async () => {
    vi.mocked(window.desktop.music.favorites).mockResolvedValue({ ok: true, data: { tracks: [], nextStart: 0, hasMore: false } });
    let pending!: Promise<boolean>;
    await act(() => { pending = player.selectMode('heart'); player.cancelHeart(); });
    expect(await pending).toBe(false);
    expect(window.desktop.music.favorites).not.toHaveBeenCalled();
  });
  it('describes a provider AbortError as cancellation, not missing recommendations', async () => {
    vi.mocked(window.desktop.music.favorites).mockResolvedValue({ ok: true, data: { tracks: [track('saved')], nextStart: 1, hasMore: false } });
    vi.mocked(window.desktop.music.artist).mockRejectedValue(new DOMException('Synthetic IPC abort', 'AbortError'));
    let pending!: Promise<boolean>;
    await act(() => { pending = player.selectMode('heart'); });
    expect(await pending).toBe(false);
    await act();
    expect(player.heartStatus).toBe('cancelled');
    expect(player.heartMessage).toMatch(/停止|取消/);
    expect(config.onPreferencesChange).not.toHaveBeenCalled();
  });
});
