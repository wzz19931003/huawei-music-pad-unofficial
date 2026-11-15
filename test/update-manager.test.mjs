import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import * as implementation from '../src/main/update-manager.mjs';
const source = { provider: 'github', owner: 'wzz19931003', repo: 'huawei-music-pad-unofficial', releaseType: 'release' };
const info = (version = '1.1.0') => ({ version, files: [{ url: 'https://signed.private/download?token=secret-token' }],
  releaseNotes: 'C:\\private\\secret-token.txt', downloadedFile: 'C:\\private\\setup.exe' });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

class Transport extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  allowDowngrade = true;
  allowPrerelease = true;
  calls = { feeds: [], checks: 0, downloads: 0, installs: [] };
  checkImpl = () => Promise.resolve(null);
  downloadImpl = () => Promise.resolve(['C:\\private\\setup.exe']);
  installImpl = () => undefined;
  setFeedURL(value) { this.calls.feeds.push(value); }
  checkForUpdates() { this.calls.checks += 1; return this.checkImpl(); }
  downloadUpdate() { this.calls.downloads += 1; return this.downloadImpl(); }
  quitAndInstall(...args) { this.calls.installs.push(args); return this.installImpl(); }
}

function setup(options = {}) {
  assert.equal(typeof implementation.createUpdateManager, 'function', 'the injected update manager must exist');
  const updater = options.updater ?? new Transport();
  const states = [];
  const manager = implementation.createUpdateManager({
    updater, currentVersion: '1.0.0', packaged: true, source, onState: (state) => states.push(state), ...options
  });
  return { updater, manager, states };
}

function assertSafe(state) {
  assert.deepEqual(Object.keys(state).sort(),
    ['status', 'currentVersion', 'version', 'progress', 'message', 'errorCode'].sort());
  assert.doesNotMatch(JSON.stringify(state), /secret-token|signed\.private|C:|setup\.exe|stack|releaseNotes|downloadedFile/);
  assert.ok(Object.isFrozen(state));
  assert.equal(typeof state.message, 'string');
  assert.ok(state.message.length > 0 && state.message.length < 200);
  if (state.progress !== null) {
    assert.equal(typeof state.progress, 'number');
    assert.ok(Number.isFinite(state.progress) && state.progress >= 0 && state.progress <= 100);
  }
}

test('initial states are distinct, immutable and never start an automatic check or download', () => {
  for (const [options, status] of [[{}, 'idle'], [{ source: null }, 'unconfigured'], [{ packaged: false }, 'development'],
    [{ source: { ...source, token: 'secret-token' } }, 'unconfigured']]) {
    const { updater, manager, states } = setup(options);
    const state = manager.getState();
    assert.equal(state.status, status);
    assert.equal(state.currentVersion, '1.0.0');
    assert.equal(state.version, null);
    assert.equal(state.progress, null);
    assertSafe(state);
    assert.equal(states.length, 1);
    assert.equal(states[0], state);
    assert.equal(updater.autoDownload, false);
    assert.equal(updater.autoInstallOnAppQuit, false);
    assert.equal(updater.allowDowngrade, false);
    assert.equal(updater.calls.checks, 0);
    assert.equal(updater.calls.downloads, 0);
    assert.deepEqual(updater.calls.feeds, status === 'idle' ? [source] : []);
    manager.dispose();
    manager.dispose();
  }
});

test('duplicate checks share one operation and an available event never starts a download', async () => {
  const { updater, manager, states } = setup();
  const transport = deferred();
  updater.checkImpl = () => transport.promise;
  const first = manager.check();
  const second = manager.check();
  void first.catch(() => {});
  void second.catch(() => {});
  assert.equal(first, second);
  assert.equal(manager.getState().status, 'checking');
  await tick();
  assert.equal(updater.calls.checks, 1);
  updater.emit('checking-for-update');
  updater.emit('update-available', info());
  assert.equal(manager.getState().status, 'available');
  assert.equal(manager.getState().version, '1.1.0');
  assert.equal(updater.calls.downloads, 0);
  transport.resolve({ updateInfo: info(), downloadPromise: null });
  assert.equal((await first).status, 'available');
  assert.deepEqual(states.map((state) => state.status), ['idle', 'checking', 'available']);
  states.forEach(assertSafe);
  manager.dispose();
});

test('no-update checks return idle and transport errors are sanitized and retryable', async () => {
  const { updater, manager, states } = setup();
  updater.checkImpl = () => {
    updater.emit('error', new Error('secret-token https://signed.private/ C:\\private\\setup.exe'));
    return Promise.reject(new Error('another raw error'));
  };
  assert.equal((await manager.check()).status, 'error');
  assert.equal(manager.getState().errorCode, 'UPDATE_CHECK_FAILED');
  updater.checkImpl = () => {
    updater.emit('update-not-available', info('1.0.0'));
    return Promise.resolve({ updateInfo: info('1.0.0') });
  };
  assert.equal((await manager.check()).status, 'idle');
  assert.equal(updater.calls.checks, 2);
  states.forEach(assertSafe);
  manager.dispose();
});

test('available events reject same, downgrade, malformed and build-only versions', async () => {
  for (const version of ['1.0.0', '0.9.9', '1.0.0+rebuilt', 'v1.1.0', '1.1', '../setup.exe', null]) {
    const { updater, manager } = setup();
    updater.checkImpl = () => {
      updater.emit('update-available', info(version));
      return Promise.resolve({ updateInfo: info(version) });
    };
    const state = await manager.check();
    assert.equal(state.status, 'error', String(version));
    assert.equal(state.errorCode, 'UPDATE_VERSION_REJECTED');
    assert.equal(state.version, null);
    assert.equal(updater.calls.downloads, 0);
    assertSafe(state);
    manager.dispose();
  }
});

async function offer(fixture, version = '1.1.0') {
  fixture.updater.checkImpl = () => {
    fixture.updater.emit('update-available', info(version));
    return Promise.resolve({ updateInfo: info(version) });
  };
  assert.equal((await fixture.manager.check()).status, 'available');
}

test('confirmed downloads coalesce, publish numeric progress and require an exact downloaded event', async () => {
  const fixture = setup();
  const { updater, manager, states } = fixture;
  await offer(fixture);
  await assert.rejects(manager.install(), { code: 'UPDATE_NOT_READY' });
  const transport = deferred();
  updater.downloadImpl = () => transport.promise;
  const first = manager.download();
  const second = manager.download();
  void first.catch(() => {});
  void second.catch(() => {});
  assert.equal(first, second);
  assert.equal(manager.getState().status, 'downloading');
  assert.equal(manager.getState().progress, 0);
  await tick();
  assert.equal(updater.calls.downloads, 1);
  await assert.rejects(manager.check(), { code: 'UPDATE_BUSY' });
  await assert.rejects(manager.install(), { code: 'UPDATE_BUSY' });
  updater.emit('download-progress', { percent: 42.75, path: 'C:\\private\\setup.exe', token: 'secret-token' });
  assert.equal(manager.getState().progress, 42.75);
  updater.emit('download-progress', { percent: 100 });
  await assert.rejects(manager.install(), { code: 'UPDATE_BUSY' });
  updater.emit('update-downloaded', info());
  assert.equal(manager.getState().status, 'downloaded');
  assert.equal(manager.getState().progress, 100);
  updater.emit('download-progress', { percent: 3 });
  assert.equal(manager.getState().progress, 100);
  assert.equal(updater.calls.installs.length, 0);
  transport.resolve(['C:\\private\\setup.exe']);
  assert.equal((await first).status, 'downloaded');
  states.forEach(assertSafe);
  manager.dispose();
});

test('a file path result without update-downloaded cannot authorize installation and can be retried', async () => {
  const fixture = setup();
  const { updater, manager } = fixture;
  await offer(fixture);
  const state = await manager.download();
  assert.equal(state.status, 'error');
  assert.equal(state.errorCode, 'UPDATE_DOWNLOAD_UNVERIFIED');
  assert.equal(state.version, '1.1.0');
  await assert.rejects(manager.install(), { code: 'UPDATE_NOT_READY' });
  updater.downloadImpl = () => {
    updater.emit('update-downloaded', info());
    return Promise.resolve(['C:\\private\\setup.exe']);
  };
  assert.equal((await manager.download()).status, 'downloaded');
  assert.equal(updater.calls.downloads, 2);
  assertSafe(manager.getState());
  manager.dispose();
});

test('unsolicited, mismatched or rejected downloaded events never authorize install', async () => {
  const fixture = setup();
  const { updater, manager } = fixture;
  updater.emit('update-available', info());
  updater.emit('update-downloaded', info());
  assert.equal(manager.getState().status, 'idle');
  await assert.rejects(manager.download(), { code: 'UPDATE_NOT_READY' });
  await assert.rejects(manager.install(), { code: 'UPDATE_NOT_READY' });
  await offer(fixture);
  updater.emit('update-downloaded', info());
  assert.equal(manager.getState().status, 'available');
  updater.downloadImpl = () => {
    updater.emit('update-downloaded', info('2.0.0'));
    updater.emit('update-downloaded', info());
    return Promise.resolve(['C:\\private\\setup.exe']);
  };
  const state = await manager.download();
  assert.equal(state.status, 'error');
  assert.equal(state.errorCode, 'UPDATE_VERSION_REJECTED');
  assert.equal(state.version, null);
  await assert.rejects(manager.install(), { code: 'UPDATE_NOT_READY' });
  assert.equal(updater.calls.installs.length, 0);
  manager.dispose();
});

async function downloadVerified(fixture) {
  await offer(fixture);
  fixture.updater.downloadImpl = () => {
    fixture.updater.emit('update-downloaded', info());
    return Promise.resolve(['C:\\private\\setup.exe']);
  };
  assert.equal((await fixture.manager.download()).status, 'downloaded');
}

test('only explicit install after verified download calls positional quitAndInstall(false, true) once', async () => {
  const fixture = setup();
  const { updater, manager, states } = fixture;
  await downloadVerified(fixture);
  await assert.rejects(manager.check(), { code: 'UPDATE_NOT_READY' });
  await assert.rejects(manager.download(), { code: 'UPDATE_NOT_READY' });
  assert.equal(manager.getState().status, 'downloaded');
  const first = manager.install('C:\\attacker\\setup.exe');
  const second = manager.install();
  void first.catch(() => {});
  void second.catch(() => {});
  assert.equal(first, second);
  assert.equal((await first).status, 'installing');
  assert.deepEqual(updater.calls.installs, [[false, true]]);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.autoDownload, false);
  assert.equal((await manager.install()).status, 'installing');
  assert.equal(updater.calls.installs.length, 1);
  states.forEach(assertSafe);
  manager.dispose();
});

test('synchronous and asynchronous installer failures stay sanitized and permit explicit retry', async () => {
  const fixture = setup();
  const { updater, manager, states } = fixture;
  await downloadVerified(fixture);
  updater.installImpl = () => { throw new Error('C:\\private\\setup.exe secret-token'); };
  assert.equal((await manager.install()).status, 'error');
  assert.equal(manager.getState().errorCode, 'UPDATE_INSTALL_FAILED');
  assert.equal(manager.getState().version, '1.1.0');
  updater.installImpl = () => undefined;
  assert.equal((await manager.install()).status, 'installing');
  updater.emit('error', new Error('https://signed.private/?token=secret-token'));
  assert.equal(manager.getState().status, 'error');
  assert.equal(manager.getState().errorCode, 'UPDATE_INSTALL_FAILED');
  assert.equal((await manager.install()).status, 'installing');
  assert.equal(updater.calls.installs.length, 3);
  states.forEach(assertSafe);
  manager.dispose();
});

test('a download failure after its event revokes install permission and retries without another check', async () => {
  const fixture = setup();
  const { updater, manager } = fixture;
  await offer(fixture);
  updater.downloadImpl = () => {
    updater.emit('update-downloaded', info());
    return Promise.reject(new Error('C:\\private\\setup.exe secret-token'));
  };
  assert.equal((await manager.download()).status, 'error');
  assert.equal(manager.getState().errorCode, 'UPDATE_DOWNLOAD_FAILED');
  await assert.rejects(manager.install(), { code: 'UPDATE_NOT_READY' });
  updater.downloadImpl = () => {
    updater.emit('update-downloaded', info());
    return Promise.resolve(['C:\\private\\setup.exe']);
  };
  assert.equal((await manager.download()).status, 'downloaded');
  assert.equal(updater.calls.checks, 1);
  assert.equal(updater.calls.downloads, 2);
  assertSafe(manager.getState());
  manager.dispose();
});

test('development, unconfigured and invalid installed versions reject actions without using the transport', async () => {
  for (const [options, status, code] of [
    [{ packaged: false, source: { token: 'secret-token' } }, 'development', 'UPDATE_DEVELOPMENT'],
    [{ source: null }, 'unconfigured', 'UPDATE_UNCONFIGURED'],
    [{ source: { ...source, token: 'secret-token' } }, 'unconfigured', 'UPDATE_SOURCE_INVALID'],
    [{ currentVersion: 'C:\\private\\setup.exe' }, 'error', 'UPDATE_CURRENT_VERSION_INVALID']
  ]) {
    const { updater, manager } = setup(options);
    assert.equal(manager.getState().status, status);
    for (const method of ['check', 'download', 'install']) {
      await assert.rejects(manager[method](), (error) => {
        assert.equal(error.code, code);
        assert.doesNotMatch(`${error.message} ${error.stack}`, /secret-token|setup\.exe|file:\/\/|[A-Z]:[\\/]/);
        return true;
      });
    }
    assert.deepEqual(updater.calls, { feeds: [], checks: 0, downloads: 0, installs: [] });
    assertSafe(manager.getState());
    manager.dispose();
  }
});

test('transport configuration failures are errors rather than a fictitious unsafe source', async () => {
  const updater = new Transport();
  updater.setFeedURL = () => { throw new Error('secret-token C:\\private\\setup.exe'); };
  const { manager } = setup({ updater });
  assert.equal(manager.getState().status, 'error');
  assert.equal(manager.getState().errorCode, 'UPDATE_TRANSPORT_INVALID');
  await assert.rejects(manager.check(), { code: 'UPDATE_TRANSPORT_INVALID' });
  assertSafe(manager.getState());
  manager.dispose();
});

test('dispose settles pending work, ignores its late completion and removes only owned listeners', async () => {
  const updater = new Transport();
  const externalErrorListener = () => {};
  updater.on('error', externalErrorListener);
  const fixture = setup({ updater });
  const { manager, states } = fixture;
  const transport = deferred();
  updater.checkImpl = () => transport.promise;
  const pending = manager.check();
  await tick();
  assert.equal(updater.calls.checks, 1);
  const state = manager.getState();
  const count = states.length;
  manager.dispose();
  manager.dispose();
  assert.equal(await pending, state);
  for (const event of ['update-available', 'update-not-available', 'download-progress', 'update-downloaded']) {
    assert.equal(updater.listenerCount(event), 0);
    updater.emit(event, info());
  }
  assert.deepEqual(updater.listeners('error'), [externalErrorListener]);
  updater.emit('error', new Error('secret-token'));
  transport.reject(new Error('late secret-token'));
  await tick();
  assert.equal(manager.getState(), state);
  assert.equal(states.length, count);
  for (const method of ['check', 'download', 'install']) await assert.rejects(manager[method](), { code: 'UPDATE_DISPOSED' });
});

test('progress accepts finite numbers only and clamps them to a renderer-safe percentage', async () => {
  const fixture = setup();
  const { updater, manager, states } = fixture;
  await offer(fixture);
  const transport = deferred();
  updater.downloadImpl = () => transport.promise;
  const pending = manager.download();
  await tick();
  for (const [value, expected] of [[-10, 0], [12.345, 12.345], [101, 100]]) {
    updater.emit('download-progress', { percent: value });
    assert.equal(manager.getState().progress, expected);
  }
  const count = states.length;
  for (const value of [NaN, Infinity, -Infinity, '42', null, {}, undefined]) {
    updater.emit('download-progress', { percent: value });
    assert.equal(manager.getState().progress, 100);
  }
  assert.equal(states.length, count);
  updater.emit('error', new Error('secret-token'));
  transport.reject(new Error('secret-token'));
  assert.equal((await pending).errorCode, 'UPDATE_DOWNLOAD_FAILED');
  states.forEach(assertSafe);
  manager.dispose();
});

test('reentrant observers cannot duplicate transport operations and subscriber exceptions are isolated', async () => {
  let manager;
  let duplicate;
  const seen = [];
  const updater = new Transport();
  manager = implementation.createUpdateManager({ updater, currentVersion: '1.0.0', packaged: true, source,
    onState(state) {
      seen.push(state.status);
      if (state.status === 'checking') duplicate = manager.check();
      throw new Error('observer failure secret-token');
    }
  });
  updater.checkImpl = () => {
    assert.equal(updater.autoDownload, false);
    assert.equal(updater.autoInstallOnAppQuit, false);
    assert.equal(updater.allowDowngrade, false);
    updater.emit('update-not-available', info('1.0.0'));
    return Promise.resolve({ updateInfo: info('1.0.0') });
  };
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  const first = manager.check();
  assert.equal(first, duplicate);
  assert.equal((await first).status, 'idle');
  assert.deepEqual(seen, ['idle', 'checking', 'idle']);
  assert.equal(updater.calls.checks, 1);
  manager.dispose();
});

test('events before transport invocation cannot complete queued operations or authorize an installer', async () => {
  const fixture = setup();
  const { updater, manager } = fixture;
  updater.checkImpl = () => {
    updater.emit('update-not-available', info('1.0.0'));
    return Promise.resolve({ updateInfo: info('1.0.0') });
  };
  const queuedCheck = manager.check();
  updater.emit('update-available', info());
  assert.equal(manager.getState().status, 'checking');
  assert.equal((await queuedCheck).status, 'idle');
  await offer(fixture);
  const queuedDownload = manager.download();
  updater.emit('update-downloaded', info());
  assert.equal(manager.getState().status, 'downloading');
  assert.equal((await queuedDownload).errorCode, 'UPDATE_DOWNLOAD_UNVERIFIED');
  await assert.rejects(manager.install(), { code: 'UPDATE_NOT_READY' });
  manager.dispose();
});

test('a resolved check result without an availability event does not invent update status', async () => {
  const { updater, manager } = setup();
  updater.checkImpl = () => Promise.resolve({ updateInfo: info() });
  assert.equal((await manager.check()).errorCode, 'UPDATE_CHECK_FAILED');
  assert.equal(manager.getState().version, null);
  assert.equal(updater.calls.downloads, 0);
  manager.dispose();
});

test('dispose before a queued action starts prevents invoking the transport', async () => {
  const { updater, manager } = setup();
  const pending = manager.check();
  manager.dispose();
  assert.equal((await pending).status, 'checking');
  await tick();
  assert.equal(updater.calls.checks, 0);
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
});
