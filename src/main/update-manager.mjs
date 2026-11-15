import { compareUpdateVersions, parseUpdateVersion, validateUpdateSource } from './update-policy.mjs';

/**
 * @typedef {'unconfigured' | 'development' | 'idle' | 'checking' | 'available' |
 *   'downloading' | 'downloaded' | 'installing' | 'error'} UpdateStatus
 * @typedef {Readonly<{status: UpdateStatus, currentVersion: string | null,
 *   version: string | null, progress: number | null,
 *   message: string, errorCode: UpdateErrorCode | null}>} UpdateState
 * @typedef {keyof typeof errors} UpdateErrorCode
 * @typedef {(...args: any[]) => void} UpdateListener
 * @typedef {{autoDownload: boolean, autoInstallOnAppQuit: boolean, allowDowngrade: boolean,
 *   on(event: string, listener: UpdateListener): unknown,
 *   removeListener(event: string, listener: UpdateListener): unknown,
 *   setFeedURL(source: Readonly<import('./update-policy.mjs').UpdateSource>): unknown,
 *   checkForUpdates(): unknown, downloadUpdate(): unknown,
 *   quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): unknown}} UpdaterTransport
 * @typedef {Readonly<{getState(): UpdateState, check(): Promise<UpdateState>,
 *   download(): Promise<UpdateState>, install(): Promise<UpdateState>, dispose(): void}>} UpdateManager
 */
const messages = Object.freeze({
  unconfigured: 'Updates are not configured for this build.',
  development: 'Updates are disabled in development.',
  idle: 'Ready to check for updates.',
  checking: 'Checking for updates.',
  available: 'An update is available. Download requires confirmation.',
  downloading: 'Downloading the update in the background.',
  downloaded: 'The update is downloaded. Restart requires confirmation.',
  installing: 'Restarting to install the update.',
  error: 'The update operation failed. Please retry.'
});

const errors = Object.freeze({
  UPDATE_UNCONFIGURED: messages.unconfigured,
  UPDATE_SOURCE_INVALID: 'The update source is not configured safely.',
  UPDATE_DEVELOPMENT: messages.development,
  UPDATE_CURRENT_VERSION_INVALID: 'The installed application version is invalid.',
  UPDATE_TRANSPORT_INVALID: 'The update transport is unavailable.',
  UPDATE_DISPOSED: 'The update manager has been disposed.',
  UPDATE_BUSY: 'Another update operation is still running.',
  UPDATE_CHECK_FAILED: 'The update check failed. Please retry.',
  UPDATE_DOWNLOAD_FAILED: 'The update download failed. Please retry.',
  UPDATE_DOWNLOAD_UNVERIFIED: 'The update download did not report verified completion. Please retry.',
  UPDATE_INSTALL_FAILED: 'The update could not be installed. Please retry when ready to restart.',
  UPDATE_VERSION_REJECTED: 'The offered update version is invalid or not newer than this application.',
  UPDATE_NOT_READY: 'This update action is not available in the current state.'
});

function publicError(code) {
  const message = errors[code] ?? messages.error;
  return Object.assign(new Error(message), { name: 'UpdateActionError', code, stack: `UpdateActionError: ${message}` });
}

/**
 * Main-process only. The caller supplies a dedicated electron-updater instance and
 * a build-controlled source, not renderer arguments. Construction never checks
 * or downloads. onState receives frozen, JSON-safe snapshots including the
 * initial snapshot; exceptions in a subscriber do not affect update handling.
 *
 * Integration contract (electron-updater 6.x):
 * - Own the injected transport exclusively; do not call its actions elsewhere.
 * - Listen to update-available / update-not-available, download-progress,
 *   update-downloaded and error. The emitter and returned promises are trusted
 *   main-process transport inputs, NEVER renderer-supplied events.
 * - A check must emit an availability event before its promise settles. A
 *   download must emit update-downloaded with the exact offered version before
 *   its promise settles; returned file paths / 100% progress are NOT evidence.
 *   Artifact hash/signature verification belongs to the actual transport, not
 *   this state machine. No installer path or metadata object is exposed here.
 * - check/download/install accept NO arguments. Gate their IPC routes to the
 *   trusted renderer, and call download/install only after explicit user actions.
 *   install calls quitAndInstall(false, true), never the v27 options-object API.
 * - Concurrent identical actions share a promise; incompatible actions reject
 *   UPDATE_BUSY. Operational failures RESOLVE an error state. Invalid actions
 *   reject fixed UpdateActionError messages/codes without local stack paths.
 * - Failed checks retry with check(); failed downloads retain the candidate and
 *   retry with download() or re-check. Failed installs retain verified permission
 *   and retry ONLY via a new explicit install(). Re-check cannot discard a
 *   verified download. All automatic download/install-on-quit flags stay false.
 * - dispose() is idempotent: detach only owned listeners, settle pending actions
 *   with the last snapshot and ignore late promises. It does not cancel I/O or
 *   restore auto-install flags. Do not reuse the transport after disposal.
 * - Every snapshot has all six fields. version/progress use null when absent;
 *   currentVersion is null only for invalid installed metadata. For an optional-
 *   field renderer type, map null version/progress to undefined and map null
 *   currentVersion to a fixed display string (e.g. 'unknown'). Progress is percent.
 *
 * @param {{updater?: UpdaterTransport | null, currentVersion: unknown, packaged: boolean,
 *   source?: unknown, onState?: (state: UpdateState) => void}} options
 * @returns {UpdateManager}
 */
export function createUpdateManager({ updater, currentVersion, packaged, source, onState }) {
  const version = parseUpdateVersion(currentVersion);
  let normalizedSource = null;
  let status = 'idle';
  let errorCode = null;
  let disposed = false;
  let invalidTransport = false;
  let invalidSource = false;
  try {
    if (updater) {
      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = false;
      updater.allowDowngrade = false;
    }
  } catch { invalidTransport = true; }
  if (packaged === true) {
    try { normalizedSource = validateUpdateSource(source); } catch { invalidSource = true; }
  }
  if (packaged !== true) {
    status = 'development';
    errorCode = 'UPDATE_DEVELOPMENT';
  } else if (invalidSource || !normalizedSource) {
    status = 'unconfigured';
    errorCode = invalidSource ? 'UPDATE_SOURCE_INVALID' : 'UPDATE_UNCONFIGURED';
  } else if (!version) {
    status = 'error';
    errorCode = 'UPDATE_CURRENT_VERSION_INVALID';
  } else if (invalidTransport || !updater || ['on', 'removeListener', 'setFeedURL', 'checkForUpdates', 'downloadUpdate', 'quitAndInstall']
    .some((name) => typeof updater[name] !== 'function')) {
    status = 'error';
    errorCode = 'UPDATE_TRANSPORT_INVALID';
  } else {
    try { updater.setFeedURL(normalizedSource); } catch {
      status = 'error';
      errorCode = 'UPDATE_TRANSPORT_INVALID';
    }
  }
  const enabled = status === 'idle';
  const disabledCode = errorCode;
  /** @type {UpdateState} */
  let state = Object.freeze({ status, currentVersion: version, version: null, progress: null,
    message: errors[errorCode] ?? messages[status], errorCode });
  let active = null;
  let candidate = null;
  let verified = null;
  const notifications = [];
  let notifying = false;
  function notify() {
    notifications.push(state);
    if (notifying) return;
    notifying = true;
    try {
      while (notifications.length && !disposed) {
        const snapshot = notifications.shift();
        try { onState?.(snapshot); } catch { /* Subscribers do not control the transport. */ }
      }
    } finally { notifying = false; }
  }
  function transition(next, fields = {}) {
    if (disposed) return;
    state = Object.freeze({ ...state, status: next, progress: null, errorCode: null,
      message: messages[next], ...fields });
    notify();
  }
  function fail(code) {
    if (active) active.outcome = 'error';
    const retryDownload = code === 'UPDATE_DOWNLOAD_FAILED' || code === 'UPDATE_DOWNLOAD_UNVERIFIED';
    const retryInstall = code === 'UPDATE_INSTALL_FAILED';
    if (!retryDownload && !retryInstall) candidate = null;
    if (!retryInstall) verified = null;
    transition('error', { version: candidate, errorCode: code, message: errors[code] });
  }
  function listening(kind) {
    return !disposed && active?.kind === kind && active.started && !active.outcome;
  }
  const listeners = {
    'update-available': (info) => {
      if (!listening('check')) return;
      const offered = parseUpdateVersion(info?.version);
      if (compareUpdateVersions(offered, version) !== 1) return fail('UPDATE_VERSION_REJECTED');
      candidate = offered;
      active.outcome = 'available';
      transition('available', { version: offered });
    },
    'update-not-available': () => {
      if (!listening('check')) return;
      active.outcome = 'idle';
      candidate = null;
      transition('idle', { version: null });
    },
    'download-progress': (progress) => {
      if (!listening('download') || typeof progress?.percent !== 'number' || !Number.isFinite(progress.percent)) return;
      transition('downloading', { progress: Math.max(0, Math.min(100, progress.percent)) });
    },
    'update-downloaded': (info) => {
      if (!listening('download')) return;
      const downloaded = parseUpdateVersion(info?.version);
      if (downloaded !== candidate || compareUpdateVersions(downloaded, version) !== 1) return fail('UPDATE_VERSION_REJECTED');
      verified = downloaded;
      active.outcome = 'downloaded';
      transition('downloaded', { progress: 100 });
    },
    error: () => {
      if (disposed || (active && !active.started) || active?.outcome === 'error') return;
      if (active) fail(active.kind === 'download' ? 'UPDATE_DOWNLOAD_FAILED' :
        active.kind === 'install' ? 'UPDATE_INSTALL_FAILED' : 'UPDATE_CHECK_FAILED');
      else if (state.status === 'installing') fail('UPDATE_INSTALL_FAILED');
    }
  };
  if (typeof updater?.on === 'function') {
    for (const [event, listener] of Object.entries(listeners)) updater.on(event, listener);
  }
  const reject = (code) => Promise.reject(publicError(code));
  const blocked = () => disposed ? 'UPDATE_DISPOSED' : !enabled ? disabledCode : null;
  function run(kind, next, fields, invoke, failureCode, incompleteCode = failureCode) {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    const operation = { kind, promise, resolve, started: false, outcome: null };
    active = operation;
    transition(next, fields);
    Promise.resolve().then(async () => {
      if (disposed || active !== operation) return;
      try {
        updater.autoDownload = false;
        updater.autoInstallOnAppQuit = false;
        updater.allowDowngrade = false;
        operation.started = true;
        await invoke();
        if (kind === 'install' && !operation.outcome) operation.outcome = 'installing';
        if (!disposed && active === operation && !operation.outcome) fail(incompleteCode);
      } catch {
        if (!disposed && active === operation && operation.outcome !== 'error') fail(failureCode);
      }
      if (!disposed && active === operation) {
        active = null;
        resolve(state);
      }
    });
    return promise;
  }
  function check() {
    if (blocked()) return reject(blocked());
    if (active) return active.kind === 'check' ? active.promise : reject('UPDATE_BUSY');
    if (verified || state.status === 'installing') return reject('UPDATE_NOT_READY');
    candidate = null;
    verified = null;
    return run('check', 'checking', { version: null }, () => updater.checkForUpdates(), 'UPDATE_CHECK_FAILED');
  }
  function download() {
    if (blocked()) return reject(blocked());
    if (active) return active.kind === 'download' ? active.promise : reject('UPDATE_BUSY');
    if (!candidate || (state.status !== 'available' && !(state.status === 'error' &&
      ['UPDATE_DOWNLOAD_FAILED', 'UPDATE_DOWNLOAD_UNVERIFIED'].includes(state.errorCode)))) return reject('UPDATE_NOT_READY');
    verified = null;
    return run('download', 'downloading', { progress: 0 }, () => updater.downloadUpdate(),
      'UPDATE_DOWNLOAD_FAILED', 'UPDATE_DOWNLOAD_UNVERIFIED');
  }
  function install() {
    if (blocked()) return reject(blocked());
    if (active) return active.kind === 'install' ? active.promise : reject('UPDATE_BUSY');
    if (state.status === 'installing') return Promise.resolve(state);
    if (!verified || verified !== candidate || compareUpdateVersions(verified, version) !== 1 ||
        (state.status !== 'downloaded' && !(state.status === 'error' && state.errorCode === 'UPDATE_INSTALL_FAILED'))) {
      return reject('UPDATE_NOT_READY');
    }
    return run('install', 'installing', { progress: 100 }, () => updater.quitAndInstall(false, true), 'UPDATE_INSTALL_FAILED');
  }
  notify();
  return Object.freeze({
    getState: () => state,
    check,
    download,
    install,
    dispose() {
      if (disposed) return;
      disposed = true;
      notifications.length = 0;
      if (typeof updater?.removeListener === 'function') {
        for (const [event, listener] of Object.entries(listeners)) updater.removeListener(event, listener);
      }
      active?.resolve(state);
      active = null;
    }
  });
}
