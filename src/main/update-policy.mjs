/**
 * Build-time/main-process updater policy. Never pass renderer input here.
 * All exports use Node's standard library only; importing this file has no I/O.
 *
 * @typedef {{provider: 'github', owner: string, repo: string, releaseType?: 'release'} |
 *   {provider: 'generic', url: string}} UpdateSource
 */
import { isIP } from 'node:net';

function invalidSource() {
  const message = 'The update source is not configured safely.';
  return Object.assign(new Error(message), {
    name: 'UpdatePolicyError', code: 'UPDATE_SOURCE_INVALID', stack: `UpdatePolicyError: ${message}`
  });
}

const placeholder = /^(?:your(?:[-_]|$)|example(?:[-_.]|$)|placeholder(?:[-_]|$)|replace[-_]?me|change[-_]?me|todo$|tbd$|owner$|repo$|repository$|username$|domain$)/i;

function plainRecord(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length && keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value');
  });
}

/**
 * Accept an explicit public github.com repo or a credential-free public DNS HTTPS
 * base URL. Unknown options, authentication, templates, reserved/local hosts and
 * the upstream author's release feed are rejected, not silently stripped.
 * This validates syntax, NOT ownership or reachability. The build owner must
 * supply and control the real feed. null/undefined means intentionally disabled.
 *
 * @param {unknown} value
 * @returns {Readonly<UpdateSource> | null}
 * @throws {Error & {code: string}} Fixed, credential-free UPDATE_SOURCE_INVALID.
 */
export function validateUpdateSource(value) {
  if (value == null) return null;
  try {
    if ((plainRecord(value, ['provider', 'owner', 'repo']) ||
        plainRecord(value, ['provider', 'owner', 'repo', 'releaseType'])) && value.provider === 'github') {
      const { owner, repo } = value;
      if (typeof owner !== 'string' || typeof repo !== 'string' ||
          !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(owner) ||
          !/^[a-z\d_-][a-z\d._-]{0,99}$/i.test(repo) ||
          placeholder.test(owner) || placeholder.test(repo) || /^daydreamcgy$/i.test(owner) ||
          (Object.hasOwn(value, 'releaseType') && value.releaseType !== 'release')) {
        throw invalidSource();
      }
      return Object.freeze({ provider: 'github', owner, repo,
        ...(Object.hasOwn(value, 'releaseType') ? { releaseType: 'release' } : {}) });
    }
    if (!plainRecord(value, ['provider', 'url']) || value.provider !== 'generic' ||
        typeof value.url !== 'string' || value.url.length > 2048 ||
        /[^\x21-\x7e]|[\\%{}<>?#]/.test(value.url)) throw invalidSource();
    const url = new URL(value.url);
    const labels = url.hostname.split('.');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port ||
        (url.href !== value.url && url.href !== `${value.url}/`) ||
        isIP(url.hostname.replace(/^\[|\]$/g, '')) || labels.length < 2 ||
        labels.some((label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(label)) ||
        /(?:^|\.)(?:localhost|localdomain|local|internal|test|invalid|example)$/.test(url.hostname) ||
        /(?:^|\.)example\.(?:com|org|net)$/.test(url.hostname) ||
        [...labels, ...url.pathname.split('/')].some((part) => placeholder.test(part)) ||
        /daydreamcgy/i.test(`${url.hostname}${url.pathname}`)) throw invalidSource();
    return Object.freeze({ provider: 'generic', url: value.url });
  } catch {
    throw invalidSource();
  }
}

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?$/;

/**
 * Strict SemVer only: no coercion, trimming, leading v, unsafe core integers or URLs.
 * @param {unknown} value @returns {string | null}
 */
export function parseUpdateVersion(value) {
  if (typeof value !== 'string' || value.length > 128 || /\s/.test(value)) return null;
  const match = VERSION.exec(value);
  if (!match || match.slice(1, 4).some((part) => !Number.isSafeInteger(Number(part))) ||
      match[4]?.split('.').some((part) => /^0\d+$/.test(part))) return null;
  return value;
}

/** @param {string} left @param {string} right @returns {-1 | 0 | 1} */
function compareNumeric(left, right) {
  if (left === right) return 0;
  return left.length === right.length ? (left > right ? 1 : -1) : (left.length > right.length ? 1 : -1);
}

/**
 * @param {unknown} candidate @param {unknown} current
 * @returns {-1 | 0 | 1 | null} null means either version is malformed.
 */
export function compareUpdateVersions(candidate, current) {
  if (parseUpdateVersion(candidate) === null || parseUpdateVersion(current) === null) return null;
  const left = VERSION.exec(candidate);
  const right = VERSION.exec(current);
  for (let i = 1; i <= 3; i += 1) {
    const difference = compareNumeric(left[i], right[i]);
    if (difference) return difference;
  }
  if (left[4] === right[4]) return 0;
  if (!left[4]) return 1;
  if (!right[4]) return -1;
  const a = left[4].split('.');
  const b = right[4].split('.');
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] === b[i]) continue;
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const numericA = /^\d+$/.test(a[i]);
    const numericB = /^\d+$/.test(b[i]);
    if (numericA && numericB) return compareNumeric(a[i], b[i]);
    if (numericA !== numericB) return numericA ? -1 : 1;
    return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}
