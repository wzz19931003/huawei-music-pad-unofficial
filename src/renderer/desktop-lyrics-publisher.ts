import type { LyricsDoc, Track } from '../shared/types';
import type { DesktopLyricsLine, DesktopLyricsNotice, DesktopLyricsPublication, DesktopLyricsPublisherApi, DesktopLyricsState } from '../shared/desktop-lyrics';
import { DESKTOP_LYRICS_LIMITS } from '../main/desktop-lyrics-policy.mjs';

const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const sourceText = (value: unknown): value is string => typeof value === 'string'
  && value.length <= DESKTOP_LYRICS_LIMITS.text && !controls.test(value);
const sourceTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
  && value >= 0 && value <= DESKTOP_LYRICS_LIMITS.positionMs;
const metadata = (value: string) => value.slice(0, DESKTOP_LYRICS_LIMITS.metadata)
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '');
// React effect reconnects keep the same preload object and native document epoch.
// Sequence ownership therefore outlives one connection, but not its API/document.
const sequences = new WeakMap<DesktopLyricsPublisherApi, { epoch: number; generation: number; next: number }>();

function copyLine(line: DesktopLyricsLine | null, end: number | null = null): DesktopLyricsLine | null {
  if (!line || !sourceText(line.text) || (line.timeMs !== null && !sourceTime(line.timeMs))) return null;
  const clean: DesktopLyricsLine = { timeMs: line.timeMs, text: line.text };
  if (sourceText(line.translation)) clean.translation = line.translation;
  const marks = line.segments;
  if (Array.isArray(marks) && marks.length <= DESKTOP_LYRICS_LIMITS.segments
    && marks.every(mark => sourceText(mark.text))
    && (!marks.length || marks.map(mark => mark.text).join('') === line.text)) {
    let previous = line.timeMs ?? 0;
    if (marks.every(mark => {
      if (mark.timeMs === null) return true;
      if (!sourceTime(mark.timeMs) || mark.timeMs < previous || (end !== null && mark.timeMs >= end)) return false;
      previous = mark.timeMs;
      return true;
    })) clean.segments = marks.map(mark => ({ timeMs: mark.timeMs, text: mark.text }));
  }
  return clean;
}

/** The optional trackId is the read-only player extension, never synthesized here.
 * generation and trackId must describe the last actual audio.src assignment,
 * not an in-flight resolvePlayback request or the selected React queue index.
 * Missing identity is backward-compatible but cannot publish an active track.
 */
export type DesktopLyricsPublisherClock = {
  generation: number;
  positionSeconds: number;
  playing: boolean;
  playbackRate: number;
  durationSeconds?: number;
  sampledAtMs?: number;
  trackId?: string | null;
};
export type DesktopLyricsPublisherPlayer = {
  current?: Pick<Track, 'id' | 'title' | 'artists'>;
  queue?: readonly Pick<Track, 'id' | 'title' | 'artists'>[];
  lyrics?: LyricsDoc | null;
  readClock(): DesktopLyricsPublisherClock;
};
export type DesktopLyricsPublisherOptions = {
  api: DesktopLyricsPublisherApi;
  getPlayer(): DesktopLyricsPublisherPlayer | null | undefined;
  onState?(state: DesktopLyricsState): void;
  onNotice?(notice: DesktopLyricsNotice): void;
};
export type DesktopLyricsPublisherConnection = { pulse(): void; stop(): void };

/** Mirror only; intentionally exposes neither playback nor preference controls. */
export function connectDesktopLyricsPublisher({ api, getPlayer, onState, onNotice }: DesktopLyricsPublisherOptions): DesktopLyricsPublisherConnection {
  let epoch: number | null = null;
  let stopped = false;
  let generation = -1;
  let generationTrackId: string | null = null;
  let cleared = false;
  let clearAcknowledged = false;
  let sending = false;
  let dirty = false; // One resample request, never a queue of clock/lyric payloads.
  let statePending = false;
  let waitingForState = true;
  let stateRevision = 0;
  // At most two source entries; a pending React selection must not relabel Audio.
  const sources = new Map<string, { track: NonNullable<DesktopLyricsPublisherPlayer['current']>; lyrics: LyricsDoc | null }>();
  const documentOwners = new WeakMap<LyricsDoc, string>();
  let lastNotice = '';
  const notify = (notice: DesktopLyricsNotice) => {
    const key = `${notice.code}:${notice.message}`;
    if (stopped || key === lastNotice) return;
    lastNotice = key;
    try { onNotice?.({ code: notice.code, message: notice.message }); } catch { /* observers cannot break publication */ }
  };
  const unavailable = () => notify({ code: 'WINDOW_FAILED', message: '桌面歌词同步暂时不可用，请稍后重试。' });
  const nextSequence = () => {
    const previous = sequences.get(api);
    const value = previous?.epoch === epoch && previous.generation === generation ? previous.next : 0;
    sequences.set(api, { epoch: epoch!, generation, next: value + 1 });
    return value;
  };
  const currentReply = (value: DesktopLyricsPublication) => {
    if (stopped || value.epoch !== epoch) return false;
    try { return getPlayer()?.readClock().generation === value.generation; } catch { return false; }
  };
  function readState() {
    if (stopped || statePending) return;
    statePending = true;
    waitingForState = true;
    const revision = stateRevision;
    void (async () => {
      try {
        const result = await api.state();
        if (stopped) return;
        if (revision !== stateRevision && (!result.ok || (epoch !== null && result.data.snapshot.epoch <= epoch))) return;
        if (result.ok) receive(result.data);
        else notify(result.error);
      } catch { if (revision === stateRevision) unavailable(); }
      finally { statePending = false; }
    })();
  }
  function send(value: DesktopLyricsPublication) {
    sending = true;
    void (async () => {
      try {
        const result = await api.publish(value);
        if (stopped || value.epoch !== epoch) return;
        if (result.ok) {
          if (value.track === null && value.generation === generation) clearAcknowledged = true;
        } else {
          if (!currentReply(value)) return;
          dirty = false;
          if (result.error.code === 'STALE') readState();
          else notify(result.error);
        }
      } catch {
        if (currentReply(value)) { dirty = false; unavailable(); }
      } finally {
        sending = false;
        if (dirty) { dirty = false; pulse(); }
      }
    })();
  }
  const sampleAndSend = () => {
    if (epoch === null) return;
    const player = getPlayer();
    if (!player) return;
    const clock = player.readClock();
    if (!Number.isSafeInteger(clock.generation) || clock.generation < 0
      || !Number.isFinite(clock.positionSeconds) || clock.positionSeconds < 0 || clock.positionSeconds * 1000 > DESKTOP_LYRICS_LIMITS.positionMs
      || typeof clock.playing !== 'boolean' || !Number.isFinite(clock.playbackRate) || clock.playbackRate < 0.25 || clock.playbackRate > 4) return;
    if (clock.generation < generation) return;
    if (clock.generation > generation) { generation = clock.generation; generationTrackId = null; cleared = false; clearAcknowledged = false; }
    if (cleared && (player.current || clearAcknowledged)) return;
    if (!player.current) {
      cleared = true;
      send({ epoch, generation: clock.generation, sequence: nextSequence(), track: null, clock: null, current: null, next: null });
      return;
    }
    if (!clock.trackId || (generationTrackId !== null && generationTrackId !== clock.trackId)) return;
    if (clock.trackId === player.current.id) {
      let lyrics = player.lyrics ?? null;
      if (lyrics) {
        const owner = documentOwners.get(lyrics);
        if (owner !== undefined && owner !== clock.trackId) lyrics = null;
        else documentOwners.set(lyrics, clock.trackId);
      }
      sources.delete(clock.trackId);
      sources.set(clock.trackId, { track: player.current, lyrics });
      if (sources.size > 2) sources.delete(sources.keys().next().value!);
    }
    let source = clock.trackId ? sources.get(clock.trackId) : undefined;
    if (!source && clock.trackId) {
      const track = player.queue?.find(candidate => candidate.id === clock.trackId);
      if (track) source = { track, lyrics: null };
    }
    if (!source) return;
    const lines = source?.lyrics?.lines ?? [];
    let current: DesktopLyricsLine | null = null;
    let next: DesktopLyricsLine | null = null;
    for (const line of lines) {
      if (!sourceTime(line.timeMs)) continue;
      if (line.timeMs <= clock.positionSeconds * 1000) current = line;
      else { next = line; break; }
    }
    if (source?.lyrics?.synced === false) { current = lines[0] ?? null; next = lines[1] ?? null; }
    const value: DesktopLyricsPublication = { epoch, generation: clock.generation, sequence: nextSequence(),
      track: { key: `g:${clock.generation}`, title: metadata(source.track.title), artist: metadata(source.track.artists.map(artist => artist.name).join(' / ')) },
      clock: { positionMs: clock.positionSeconds * 1000, playing: clock.playing, rate: clock.playbackRate }, current: copyLine(current, next?.timeMs), next: copyLine(next) };
    if (new TextEncoder().encode(JSON.stringify(value)).length > DESKTOP_LYRICS_LIMITS.publicationBytes) {
      if (value.current) delete value.current.segments;
      if (value.next) delete value.next.segments;
    }
    generationTrackId = clock.trackId;
    send(value);
  };
  const pulse = () => {
    if (stopped) return;
    if (sending) { dirty = true; return; }
    if (epoch === null || waitingForState) { readState(); return; }
    try { sampleAndSend(); } catch { unavailable(); }
  };
  const receive = (state: DesktopLyricsState) => {
    if (stopped || (epoch !== null && state.snapshot.epoch < epoch)) return;
    stateRevision++;
    const changed = epoch !== state.snapshot.epoch;
    epoch = state.snapshot.epoch;
    waitingForState = false;
    if (changed) { generation = -1; generationTrackId = null; cleared = false; clearAcknowledged = false; }
    const nativeGeneration = state.snapshot.generation;
    if (nativeGeneration !== null && nativeGeneration >= generation && state.snapshot.track === null) {
      generation = nativeGeneration; generationTrackId = null; cleared = true; clearAcknowledged = true;
    }
    try { onState?.(state); } catch { /* observers cannot break lifecycle or subscription cleanup */ }
    if (state.notice) notify(state.notice);
    if (changed) pulse();
  };
  const unsubscribe = api.onState(receive);
  readState();
  const timer = setInterval(pulse, 200);
  return { pulse, stop() { if (stopped) return; stopped = true; clearInterval(timer); unsubscribe(); sources.clear(); } };
}
