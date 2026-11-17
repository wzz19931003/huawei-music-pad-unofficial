import { DESKTOP_LYRICS_LIMITS, validatePublication } from './desktop-lyrics-policy.mjs';

/** Pure rendering clock. It may only extrapolate the main-received anchor for 1.5s. */
export function projectLyricsDisplay(snapshot, nowMs) {
  const anchor = snapshot.anchor;
  const age = anchor ? Math.max(0, nowMs - anchor.receivedAtMs) : 0;
  const elapsed = anchor?.playing ? Math.min(age, DESKTOP_LYRICS_LIMITS.extrapolateMs) : 0;
  const positionMs = anchor ? Math.min(DESKTOP_LYRICS_LIMITS.positionMs, anchor.positionMs + elapsed * anchor.rate) : 0;
  let current = snapshot.current;
  let next = snapshot.next;
  if (next?.timeMs !== null && next?.timeMs !== undefined && positionMs >= next.timeMs) {
    current = next;
    next = null;
  }
  let activeWord = -1;
  const segments = current?.segments;
  // Partial/null word timings do not establish trustworthy word boundaries.
  if (current && current.timeMs !== null && positionMs >= current.timeMs && segments?.length
    && segments.every(segment => segment.timeMs !== null) && segments.map(segment => segment.text).join('') === current.text) {
    for (let index = 0; index < segments.length; index++) {
      if (segments[index].timeMs <= positionMs) activeWord = index;
    }
  }
  return { positionMs, current, next, activeWord, stale: Boolean(anchor?.playing && age >= DESKTOP_LYRICS_LIMITS.extrapolateMs) };
}

/** A renderer-document epoch is main-owned. Generations belong to real Audio loads. */
export function createLyricsTimeline(now = Date.now) {
  let epoch = 1;
  let generation = -1;
  let sequence = -1;
  let key = null;
  let snapshot = { epoch, generation: null, track: null, anchor: null, current: null, next: null };
  return {
    snapshot: () => structuredClone(snapshot),
    reset() {
      epoch++;
      generation = -1;
      sequence = -1;
      key = null;
      snapshot = { epoch, generation: null, track: null, anchor: null, current: null, next: null };
      return epoch;
    },
    accept(input) {
      const value = validatePublication(input);
      if (!value) return { ok: false, code: 'INVALID' };
      if (value.epoch !== epoch || value.generation < generation
        || (value.generation === generation && (value.sequence <= sequence || (value.track !== null && value.track.key !== key)))) return { ok: false, code: 'STALE' };
      generation = value.generation;
      sequence = value.sequence;
      key = value.track?.key;
      snapshot = {
        epoch, generation, track: value.track,
        anchor: value.clock ? { ...value.clock, receivedAtMs: now() } : null,
        current: value.current, next: value.next,
      };
      return { ok: true };
    },
  };
}
