/** Pure, browser-safe boundary: no Electron, filesystem, provider, or account access. */
export const DESKTOP_LYRICS_LIMITS = Object.freeze({
  publicationBytes: 32768, text: 2048, metadata: 256, key: 128, segments: 128,
  positionMs: 24 * 60 * 60 * 1000, extrapolateMs: 1500,
});

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const keys = (value, required, optional = []) => record(value)
  && required.every(key => Object.hasOwn(value, key))
  && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const integer = value => Number.isSafeInteger(value) && value >= 0;
const time = value => Number.isFinite(value) && value >= 0 && value <= DESKTOP_LYRICS_LIMITS.positionMs;
const text = (value, max) => typeof value === 'string' && value.length <= max
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);

function line(value) {
  if (value === null) return null;
  if (!keys(value, ['timeMs', 'text'], ['translation', 'segments'])
    || !(value.timeMs === null || time(value.timeMs)) || !text(value.text, DESKTOP_LYRICS_LIMITS.text)) return undefined;
  const clean = { timeMs: value.timeMs, text: value.text };
  if (Object.hasOwn(value, 'translation')) {
    if (!text(value.translation, DESKTOP_LYRICS_LIMITS.text)) return undefined;
    clean.translation = value.translation;
  }
  if (Object.hasOwn(value, 'segments')) {
    if (!Array.isArray(value.segments) || value.segments.length > DESKTOP_LYRICS_LIMITS.segments) return undefined;
    let previous = -1;
    const segments = [];
    for (const segment of value.segments) {
      if (!keys(segment, ['timeMs', 'text']) || !(segment.timeMs === null || time(segment.timeMs))
        || !text(segment.text, DESKTOP_LYRICS_LIMITS.text)) return undefined;
      if (segment.timeMs !== null) {
        if (segment.timeMs < previous || (value.timeMs !== null && segment.timeMs < value.timeMs)) return undefined;
        previous = segment.timeMs;
      }
      segments.push({ timeMs: segment.timeMs, text: segment.text });
    }
    if (segments.length && segments.map(segment => segment.text).join('') !== value.text) return undefined;
    clean.segments = segments;
  }
  return clean;
}

const DEFAULT_PREFERENCES = Object.freeze({ version: 1, visible: false, locked: false,
  fontSize: 32, color: '#ffffff', highlightColor: '#8de7cd', showTranslation: true, wordHighlight: true, position: null });
const booleanPrefs = ['visible', 'locked', 'showTranslation', 'wordHighlight'];
const colorPrefs = ['color', 'highlightColor'];
const hexColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/iu.test(value);
const coordinate = value => Number.isFinite(value) && Math.abs(value) <= 1000000;

export function sanitizeLyricsPreferences(input) {
  const prefs = { ...DEFAULT_PREFERENCES };
  if (!record(input) || input.version !== 1) return prefs;
  for (const name of booleanPrefs) if (typeof input[name] === 'boolean') prefs[name] = input[name];
  for (const name of colorPrefs) if (hexColor(input[name])) prefs[name] = input[name].toLowerCase();
  if (Number.isFinite(input.fontSize)) prefs.fontSize = Math.max(18, Math.min(64, Math.round(input.fontSize)));
  if (record(input.position) && coordinate(input.position.x) && coordinate(input.position.y)) {
    prefs.position = { x: Math.round(input.position.x), y: Math.round(input.position.y) };
  }
  return prefs;
}

export function validateLyricsPreferencePatch(input, role) {
  const allowed = ['locked', 'fontSize', ...colorPrefs, 'showTranslation', 'wordHighlight'];
  if (role === 'main') allowed.push('visible');
  if ((role !== 'main' && role !== 'overlay') || !keys(input, [], allowed) || !Object.keys(input).length) return null;
  const patch = {};
  for (const [name, value] of Object.entries(input)) {
    if (booleanPrefs.includes(name) && typeof value === 'boolean') patch[name] = value;
    else if (colorPrefs.includes(name) && hexColor(value)) patch[name] = value.toLowerCase();
    else if (name === 'fontSize' && Number.isInteger(value) && value >= 18 && value <= 64) patch[name] = value;
    else return null;
  }
  return patch;
}

/** Coordinates are Electron DIP units, including negative secondary-monitor positions. */
export function lyricsWindowBounds(position, displays, primaryId, fontSize = 32) {
  const valid = displays.filter(display => record(display.workArea) && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(display.workArea[key]))
    && display.workArea.width > 0 && display.workArea.height > 0);
  if (!valid.length) throw new Error('No usable display workarea');
  const point = position && coordinate(position.x) && coordinate(position.y) ? position : null;
  let display = valid.find(candidate => candidate.id === primaryId) || valid[0];
  if (point) {
    const distance = candidate => {
      const area = candidate.workArea;
      const x = Math.max(area.x, Math.min(area.x + area.width, point.x));
      const y = Math.max(area.y, Math.min(area.y + area.height, point.y));
      return (x - point.x) ** 2 + (y - point.y) ** 2;
    };
    display = valid.reduce((nearest, candidate) => distance(candidate) < distance(nearest) ? candidate : nearest, display);
  }
  const area = display.workArea;
  const width = Math.min(900, Math.floor(area.width));
  const safeFont = Number.isFinite(fontSize) ? Math.max(18, Math.min(64, fontSize)) : 32;
  const height = Math.min(Math.ceil(safeFont * 2.7 + 106), Math.floor(area.height));
  return {
    x: Math.round(Math.max(area.x, Math.min(area.x + area.width - width, point?.x ?? area.x + (area.width - width) / 2))),
    y: Math.round(Math.max(area.y, Math.min(area.y + area.height - height, point?.y ?? area.y + area.height - height - 36))),
    width, height,
  };
}

/** Independent token buckets per role/capability; denial never allocates per-sender maps. */
export function createLyricsRateLimit(perSecond, burst, now = Date.now) {
  let tokens = burst;
  let last = now();
  return {
    reset() { tokens = burst; last = now(); },
    take() {
      const sample = Math.max(last, now());
      tokens = Math.min(burst, tokens + (sample - last) * perSecond / 1000);
      last = sample;
      if (tokens < 1) return false;
      tokens--;
      return true;
    },
  };
}

/** Development documents may use only an explicit loopback HTTP URL; production is local. */
export function isLocalLyricsDocumentUrl(value) {
  try {
    if (typeof value !== 'string' || value.length > 4096) return false;
    const url = new URL(value);
    if (url.username || url.password || url.hash || url.search || decodeURIComponent(url.pathname).includes('\0')) return false;
    return (url.protocol === 'file:' && url.hostname === '')
      || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  } catch { return false; }
}

export function isAllowedLyricsResource(details, documentUrl, assetRootUrl) {
  try {
    if (!isLocalLyricsDocumentUrl(documentUrl)) return false;
    if (details.resourceType === 'mainFrame') return details.url === documentUrl;
    if (!['script', 'stylesheet', 'font'].includes(details.resourceType)) return false;
    const url = new URL(details.url);
    const root = new URL(assetRootUrl);
    if (url.username || url.password || url.hash || url.protocol !== root.protocol || url.host !== root.host) return false;
    const pathname = decodeURIComponent(url.pathname);
    const rootPath = decodeURIComponent(root.pathname);
    if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(part => part === '..' || part === '.')) return false;
    return rootPath.endsWith('/') && pathname.startsWith(rootPath);
  } catch { return false; }
}

/** Fail closed even while a frame/WebContents is being torn down. No origin/prefix trust. */
export function isTrustedLyricsSender(event, expected, exactDocumentUrl) {
  try {
    const frame = event?.senderFrame;
    return Boolean(expected && !expected.isDestroyed() && event.sender === expected
      && frame && frame === expected.mainFrame && frame.parent === null && !frame.detached
      && frame.url === exactDocumentUrl && expected.getURL() === exactDocumentUrl);
  } catch { return false; }
}

/** Reject, never truncate, untrusted wire publications. Clone only the explicit schema. */
export function validatePublication(value) {
  if (!keys(value, ['epoch', 'generation', 'sequence', 'track', 'clock', 'current', 'next'])
    || !integer(value.epoch) || !integer(value.generation) || !integer(value.sequence)) return null;
  const clean = { epoch: value.epoch, generation: value.generation, sequence: value.sequence, track: null, clock: null, current: null, next: null };
  if (value.track === null) return value.clock === null && value.current === null && value.next === null ? clean : null;
  if (!keys(value.track, ['key', 'title', 'artist']) || typeof value.track.key !== 'string'
    || !/^[A-Za-z0-9._:-]{1,128}$/u.test(value.track.key)
    || !text(value.track.title, DESKTOP_LYRICS_LIMITS.metadata) || !text(value.track.artist, DESKTOP_LYRICS_LIMITS.metadata)
    || !keys(value.clock, ['positionMs', 'playing', 'rate']) || !time(value.clock.positionMs)
    || typeof value.clock.playing !== 'boolean' || !Number.isFinite(value.clock.rate) || value.clock.rate < 0.25 || value.clock.rate > 4) return null;
  const current = line(value.current);
  const next = line(value.next);
  if (current === undefined || next === undefined) return null;
  if (current && next && current.timeMs !== null && next.timeMs !== null && next.timeMs <= current.timeMs) return null;
  if (current?.segments?.some(segment => segment.timeMs !== null && next?.timeMs !== null && next?.timeMs !== undefined && segment.timeMs >= next.timeMs)) return null;
  clean.track = { key: value.track.key, title: value.track.title, artist: value.track.artist };
  clean.clock = { positionMs: value.clock.positionMs, playing: value.clock.playing, rate: value.clock.rate };
  clean.current = current;
  clean.next = next;
  return new TextEncoder().encode(JSON.stringify(clean)).length <= DESKTOP_LYRICS_LIMITS.publicationBytes ? clean : null;
}
