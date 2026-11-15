/** Pure playback policy. No Audio, credentials, IPC or provider protocol lives here. */

/**
 * @typedef {'all' | 'one' | 'shuffle' | 'heart'} PlayMode
 * @typedef {import('../shared/types').Track} Track
 * @typedef {{length: number, current: number, remaining: number[]}} ShuffleState
 * @typedef {{mode?: unknown, index?: number, length?: number, auto?: boolean,
 *   shuffleState?: ShuffleState | null, rng?: () => number}} PlaybackStepOptions
 * @typedef {{index: number, replay: boolean, stopped: boolean,
 *   shuffleState: ShuffleState | null}} PlaybackStep
 * @typedef {(value: string) => unknown | Promise<unknown>} TrackLoader
 * @typedef {{favorites?: readonly Track[], loadArtist?: TrackLoader, search?: TrackLoader,
 *   signal?: AbortSignal, maxFavoriteSeeds?: number, maxSeedArtists?: number,
 *   maxRequests?: number, maxRecommendations?: number, maxTracksPerResponse?: number}} HeartQueueOptions
 * @typedef {{status: 'ready' | 'no-favorites' | 'no-candidates' | 'aborted',
 *   queue: Track[], recommendations: Track[], requests: number, failures: number}} HeartQueueResult
 */

/** @type {readonly Readonly<{id: PlayMode, label: string}>[]} */
export const PLAY_MODES = Object.freeze([
  Object.freeze({ id: 'all', label: '列表' }),
  Object.freeze({ id: 'one', label: '单曲循环' }),
  Object.freeze({ id: 'shuffle', label: '随机播放' }),
  Object.freeze({ id: 'heart', label: '心动模式' }),
]);

export const PLAY_MODE_ORDER = Object.freeze(PLAY_MODES.map(mode => mode.id));

/** Defaults are also hard ceilings; callers may lower, never raise them. */
export const HEART_LIMITS = Object.freeze({
  maxFavoriteSeeds: 24, maxSeedArtists: 4, maxRequests: 8, maxRecommendations: 24, maxTracksPerResponse: 100,
});

/**
 * Self-implemented Huawei metadata discovery, not NetEase's recommender.
 * Callbacks are existing unary loadArtist(id)/search(query), returning {tracks}.
 * Names match after trim/case/whitespace folding; artist and album IDs are opaque
 * exact matches. Only selected favorite metadata establishes a relationship.
 *
 * Success is strictly [favorite, new, favorite, new, ...], without duplicate IDs.
 * Unpaired items are omitted, not padded with random favorites. Non-ready results
 * have empty queue/recommendations. requests counts attempted reads; failures
 * counts non-abort errors or malformed responses, not valid empty responses.
 * Aborting cancels our wait, not the underlying IPC; late settlements are ignored.
 * Work is capped by HEART_LIMITS, apart from a linear scan of all input favorite
 * IDs necessary to exclude unsampled/already-unavailable favorites as well.
 *
 * @param {HeartQueueOptions} [options]
 * @returns {Promise<HeartQueueResult>}
 */
export async function buildHeartQueue({
  favorites = [], loadArtist, search, signal, maxRequests, maxSeedArtists, maxFavoriteSeeds,
  maxRecommendations, maxTracksPerResponse,
} = {}) {
  const requestLimit = boundedLimit(maxRequests, HEART_LIMITS.maxRequests);
  const artistLimit = boundedLimit(maxSeedArtists, HEART_LIMITS.maxSeedArtists);
  const seedLimit = boundedLimit(maxFavoriteSeeds, HEART_LIMITS.maxFavoriteSeeds);
  const responseLimit = boundedLimit(maxTracksPerResponse, HEART_LIMITS.maxTracksPerResponse);
  /** @type {HeartQueueResult} */
  const result = { status: 'no-favorites', queue: [], recommendations: [], requests: 0, failures: 0 };
  if (signal?.aborted) return { ...result, status: 'aborted' };
  const list = Array.isArray(favorites) ? favorites : [];
  const favoriteIds = new Set();
  const uniqueSeeds = new Map();
  let hasPlayableFavorite = false;
  for (const item of list) {
    if (nonempty(item?.id)) favoriteIds.add(item.id);
    if (uniqueSeeds.size >= seedLimit && hasPlayableFavorite) continue;
    if (!isPlayableTrack(item)) continue;
    hasPlayableFavorite = true;
    if (uniqueSeeds.size < seedLimit && !uniqueSeeds.has(item.id)) uniqueSeeds.set(item.id, item);
  }
  if (!hasPlayableFavorite) return result;
  const seeds = [...uniqueSeeds.values()];
  result.status = 'no-candidates';
  const candidateLimit = Math.min(seeds.length, boundedLimit(maxRecommendations, HEART_LIMITS.maxRecommendations));
  if (candidateLimit === 0 || responseLimit === 0) return result;
  const artistIds = new Set(seeds.flatMap(item => item.artists.map(artist => artist.id).filter(nonempty)));
  const artistNames = new Set(seeds.flatMap(item => item.artists.map(artist => normalizedName(artist.name))));
  const albumIds = new Set(seeds.map(item => item.album?.id).filter(nonempty));
  const candidates = new Map();
  const collect = response => {
    const tracks = response?.tracks;
    if (response?.ok === false || !Array.isArray(tracks)) {
      result.failures += 1;
      return;
    }
    const scanLimit = Math.min(tracks.length, responseLimit);
    for (let i = 0; i < scanLimit && candidates.size < candidateLimit; i += 1) {
      const item = tracks[i];
      if (!isPlayableTrack(item) || favoriteIds.has(item.id) || candidates.has(item.id)) continue;
      const related = item.artists.some(artist => artistIds.has(artist.id) || artistNames.has(normalizedName(artist.name)))
        || (item.album && albumIds.has(item.album.id));
      if (related) candidates.set(item.id, item);
    }
  };
  const request = async (callback, value) => {
    result.requests += 1;
    try {
      const response = await callWithAbort(() => callback(value), signal);
      if (signal?.aborted) throw abortError();
      collect(response);
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw abortError();
      result.failures += 1;
    }
  };
  const planned = new Set();
  const plan = [];
  const add = (kind, callback, value, key = value) => {
    const identity = `${kind}:${key}`;
    if (typeof callback !== 'function' || planned.has(identity) || plan.length >= requestLimit) return;
    planned.add(identity);
    plan.push([callback, value]);
  };
  const seedArtists = new Map();
  for (const seed of seeds) {
    for (const artist of seed.artists) {
      const key = nonempty(artist.id) ? `id:${artist.id}` : `name:${normalizedName(artist.name)}`;
      if (seedArtists.size < artistLimit && !seedArtists.has(key)) seedArtists.set(key, artist);
    }
  }
  for (const artist of seedArtists.values()) {
    if (nonempty(artist.id)) add('artist', loadArtist, artist.id);
    add('search', search, artist.name, normalizedName(artist.name));
  }
  for (const seed of seeds) {
    if (seed.album) add('search', search, seed.album.title, normalizedName(seed.album.title));
  }
  try {
    for (const [callback, value] of plan) {
      if (signal?.aborted) throw abortError();
      if (candidates.size >= candidateLimit) break;
      await request(callback, value);
    }
    if (signal?.aborted) throw abortError();
  } catch (error) {
    if (error?.name !== 'AbortError') throw error;
    return { ...result, status: 'aborted', queue: [], recommendations: [] };
  }
  result.recommendations = [...candidates.values()];
  if (result.recommendations.length === 0) return result;
  result.status = 'ready';
  result.queue = result.recommendations.flatMap((candidate, i) => [seeds[i], candidate]);
  return result;
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function boundedLimit(value, ceiling) {
  return Number.isFinite(value) ? Math.max(0, Math.min(ceiling, Math.floor(value))) : ceiling;
}

function isPlayableTrack(track) {
  return !!track && nonempty(track.id) && nonempty(track.title) && track.available === true
    && Array.isArray(track.artists)
    && track.artists.every(artist => artist && nonempty(artist.name) && (artist.id === undefined || nonempty(artist.id)))
    && (track.album === undefined || (!!track.album && nonempty(track.album.id) && nonempty(track.album.title)));
}

function normalizedName(name) {
  return name.trim().toLowerCase().replace(/\s+/gu, ' ');
}

function abortError() {
  return new DOMException('Heart queue collection aborted.', 'AbortError');
}

// Existing IPC wrappers cannot cancel an in-flight read. Cancel our wait and
// attach handlers to late settlements so they cannot commit or leak rejections.
function callWithAbort(callback, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const settle = (complete, value) => {
      signal?.removeEventListener('abort', onAbort);
      complete(value);
    };
    const onAbort = () => settle(reject, abortError());
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      Promise.resolve(callback()).then(
        value => settle(resolve, value),
        error => settle(reject, error),
      );
    } catch (error) {
      settle(reject, error);
    }
  });
}

/**
 * Old sequential/off settings intentionally become the wrapping list mode.
 * @param {unknown} mode
 * @returns {PlayMode}
 */
export function normalizePlayMode(mode) {
  return PLAY_MODE_ORDER.find(id => id === mode) ?? 'all';
}

/** @param {unknown} mode */
export function modeLabel(mode) {
  return PLAY_MODES.find(item => item.id === normalizePlayMode(mode)).label;
}

/** @param {unknown} mode */
export function nextMode(mode) {
  return PLAY_MODE_ORDER[(PLAY_MODE_ORDER.indexOf(normalizePlayMode(mode)) + 1) % PLAY_MODE_ORDER.length];
}

/**
 * Pure next/ended policy. Pass the returned shuffleState into the next call;
 * reset it to null whenever tracks are replaced, reordered, or directly selected.
 * A same-index step has replay=true so callers can replay native Audio explicitly.
 * Only auto-ended repeats in 'one'; manual next advances and wraps. 'all' and
 * 'heart' both wrap, retaining the intentional favorite/discovery heart ordering.
 * Shuffle counts the active index in the initial cycle; subsequent cycles include
 * every queue index exactly once and never repeat across the cycle boundary.
 * rng() must return a finite number in [0, 1), otherwise a RangeError is thrown.
 * @param {PlaybackStepOptions} [options]
 * @returns {PlaybackStep}
 */
export function nextPlaybackStep({
  mode = 'all', index = -1, length = 0, auto = false, shuffleState = null, rng = Math.random,
} = {}) {
  if (!Number.isSafeInteger(length) || length <= 0) {
    return { index: -1, replay: false, stopped: true, shuffleState: null };
  }
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    return { index: 0, replay: false, stopped: false, shuffleState: null };
  }
  if (normalizePlayMode(mode) === 'one' && auto) {
    return { index, replay: true, stopped: false, shuffleState: null };
  }
  if (normalizePlayMode(mode) === 'shuffle' && length > 1) {
    const validState = shuffleState?.length === length && shuffleState.current === index
      && Array.isArray(shuffleState.remaining) && shuffleState.remaining.length < length
      && Array.from(shuffleState.remaining).every(i => Number.isInteger(i) && i >= 0 && i < length && i !== index)
      && new Set(shuffleState.remaining).size === shuffleState.remaining.length;
    let remaining = validState ? shuffleState.remaining.slice() : null;
    if (!remaining) {
      remaining = shuffled(Array.from({ length }, (_, i) => i).filter(i => i !== index), rng);
    } else if (remaining.length === 0) {
      remaining = shuffled(Array.from({ length }, (_, i) => i), rng);
      if (remaining[0] === index) [remaining[0], remaining[1]] = [remaining[1], remaining[0]];
    }
    const [target, ...rest] = remaining;
    return {
      index: target, replay: false, stopped: false,
      shuffleState: { length, current: target, remaining: rest },
    };
  }
  const target = (index + 1) % length;
  return { index: target, replay: target === index, stopped: false, shuffleState: null };
}

function shuffled(values, rng) {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError('rng() must return a finite number in [0, 1).');
    }
    const j = Math.floor(value * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}
